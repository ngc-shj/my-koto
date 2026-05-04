import { describe, it, expect } from "vitest";
import { generateNonce } from "./csp";

describe("generateNonce", () => {
  it("returns a URL-safe base64 string (no +, /, = characters)", () => {
    const nonce = generateNonce();
    expect(nonce).not.toMatch(/[+/=]/);
    // URL-safe base64 uses only A-Z, a-z, 0-9, -, _
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes at least 128 bits of entropy (16 bytes = 22+ base64url chars)", () => {
    const nonce = generateNonce();
    // 16 bytes in base64url (without padding) = ceil(16 * 4/3) = 22 chars
    expect(nonce.length).toBeGreaterThanOrEqual(22);
  });

  it("generates unique values on repeated calls", () => {
    const samples = new Set(Array.from({ length: 100 }, () => generateNonce()));
    // All 100 values should be distinct (collision probability is negligible with 128-bit entropy)
    expect(samples.size).toBe(100);
  });

  it("does not use Math.random (source code check)", async () => {
    // Guard against accidental regression to weak PRNG
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(dir, "csp.ts"), "utf-8");
    expect(source).not.toContain("Math.random");
  });
});
