import { describe, it, expect } from "vitest";
import { generateNonce, buildCsp } from "./policy";

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
    const source = readFileSync(resolve(dir, "policy.ts"), "utf-8");
    expect(source).not.toContain("Math.random");
  });
});

describe("buildCsp", () => {
  const testNonce = "abc123-test-nonce";

  describe("production mode", () => {
    it("includes nonce in script-src", () => {
      const csp = buildCsp(testNonce, "production");
      expect(csp).toContain(`'nonce-${testNonce}'`);
    });

    it("includes strict-dynamic in script-src", () => {
      const csp = buildCsp(testNonce, "production");
      expect(csp).toContain("'strict-dynamic'");
    });

    it("does not include unsafe-inline in script-src", () => {
      const csp = buildCsp(testNonce, "production");
      // Extract only the script-src directive to avoid false positives from other directives
      const scriptSrcMatch = csp.match(/script-src[^;]*/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![0]).not.toContain("'unsafe-inline'");
    });

    it("does not include unsafe-eval in script-src", () => {
      const csp = buildCsp(testNonce, "production");
      const scriptSrcMatch = csp.match(/script-src[^;]*/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![0]).not.toContain("'unsafe-eval'");
    });

    it("includes upgrade-insecure-requests", () => {
      const csp = buildCsp(testNonce, "production");
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it("works with null nonce (fallback to strict-dynamic only)", () => {
      const csp = buildCsp(null, "production");
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).not.toContain("'nonce-");
    });
  });

  describe("development mode", () => {
    it("includes unsafe-inline in script-src for Next.js dev runtime", () => {
      const csp = buildCsp(null, "development");
      expect(csp).toContain("'unsafe-inline'");
    });

    it("includes unsafe-eval in script-src for Next.js dev runtime", () => {
      const csp = buildCsp(null, "development");
      expect(csp).toContain("'unsafe-eval'");
    });

    it("does not include upgrade-insecure-requests", () => {
      const csp = buildCsp(null, "development");
      expect(csp).not.toContain("upgrade-insecure-requests");
    });

    it("ignores nonce even if provided (dev does not use nonce)", () => {
      const csp = buildCsp(testNonce, "development");
      // Dev CSP should not embed nonce; uses unsafe-inline instead
      expect(csp).not.toContain(`'nonce-${testNonce}'`);
    });
  });
});
