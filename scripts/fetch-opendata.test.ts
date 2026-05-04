import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { validateAndPersist } from "./fetch-opendata";

const TMP_DIR = join(tmpdir(), "koto-test-" + Date.now());

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

const SimpleSchema = z.object({ value: z.number().min(0).max(100) });

describe("validateAndPersist", () => {
  it("writes file and returns ok:true for valid data", async () => {
    const outputPath = join(TMP_DIR, "valid.json");
    const notifier = vi.fn();

    const result = await validateAndPersist({ value: 42 }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(true);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf-8"))).toEqual({ value: 42 });
    expect(notifier).not.toHaveBeenCalled();
  });

  it("does NOT overwrite existing file on schema failure", async () => {
    const outputPath = join(TMP_DIR, "existing.json");

    // Write existing content
    const existingContent = JSON.stringify({ value: 50 }) + "\n";
    writeFileSync(outputPath, existingContent, "utf-8");

    const notifier = vi.fn();

    // Attempt to write invalid data (value > 100)
    const result = await validateAndPersist({ value: 999 }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(false);

    // Existing file must remain unchanged
    expect(readFileSync(outputPath, "utf-8")).toBe(existingContent);
  });

  it("calls Discord notifier on schema failure", async () => {
    const outputPath = join(TMP_DIR, "notify-test.json");
    const notifier = vi.fn().mockResolvedValue(undefined);

    await validateAndPersist({ value: -999 }, SimpleSchema, outputPath, notifier);

    expect(notifier).toHaveBeenCalledOnce();
    expect(notifier.mock.calls[0]?.[0]).toContain("Schema validation failed");
  });

  it("returns ok:false with reason on schema failure", async () => {
    const outputPath = join(TMP_DIR, "reason-test.json");
    const notifier = vi.fn();

    const result = await validateAndPersist({ value: "not-a-number" }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
    }
  });

  it("does not create the file if schema fails and file does not exist", async () => {
    const outputPath = join(TMP_DIR, "never-created.json");
    const notifier = vi.fn();

    await validateAndPersist({ value: 999 }, SimpleSchema, outputPath, notifier);

    expect(existsSync(outputPath)).toBe(false);
  });
});
