import { describe, it, expect } from "vitest";
import { gomiSubscriptionUrl } from "./url";

const HOST = "koto.example.com";
// Use a real district id from the rebuilt master so this stays consistent
// with the route handler's allowlist (T-07 fix).
const DISTRICT = "kameido-1-3";

describe("gomiSubscriptionUrl — UA-based scheme selection", () => {
  it("returns webcal:// for iPhone UA", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toMatch(/^webcal:\/\//);
  });

  it("returns webcal:// for iPad UA", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toMatch(/^webcal:\/\//);
  });

  it("returns webcal:// for iPod UA", () => {
    const ua = "Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X)";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toMatch(/^webcal:\/\//);
  });

  it("returns https:// for Android UA", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toMatch(/^https:\/\//);
  });

  it("returns https:// for desktop Chrome UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toMatch(/^https:\/\//);
  });

  it("returns https:// for empty UA string", () => {
    const url = gomiSubscriptionUrl(DISTRICT, HOST, "");
    expect(url).toMatch(/^https:\/\//);
  });

  it("includes the district in the path", () => {
    const ua = "";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toContain(DISTRICT);
  });

  it("includes the host in the URL", () => {
    const ua = "";
    const url = gomiSubscriptionUrl(DISTRICT, HOST, ua);
    expect(url).toContain(HOST);
  });

  it("uses path that matches the actual route handler (no /route.ics suffix)", () => {
    // F-02 regression guard: the previous implementation appended
    // `/route.ics` which 404s. Verify the path matches the live route.
    const url = gomiSubscriptionUrl(DISTRICT, HOST, "");
    expect(url).toBe(`https://${HOST}/api/ics/gomi/${DISTRICT}`);
  });

  // F-19 regression guard: a dev session served over http://localhost
  // would previously synthesise an https:// link the browser cannot reach.
  describe("scheme honours the page protocol on non-iOS UAs", () => {
    it("returns http:// when the page is served over http:", () => {
      const url = gomiSubscriptionUrl(DISTRICT, HOST, "Mozilla/5.0", "http:");
      expect(url).toMatch(/^http:\/\//);
      expect(url).not.toMatch(/^https:/);
    });

    it("returns https:// when the page is served over https:", () => {
      const url = gomiSubscriptionUrl(DISTRICT, HOST, "Mozilla/5.0", "https:");
      expect(url).toMatch(/^https:\/\//);
    });

    it("still returns webcal:// on iPhone regardless of page protocol", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
      expect(gomiSubscriptionUrl(DISTRICT, HOST, ua, "http:")).toMatch(
        /^webcal:\/\//,
      );
      expect(gomiSubscriptionUrl(DISTRICT, HOST, ua, "https:")).toMatch(
        /^webcal:\/\//,
      );
    });

    it("falls back to https for unexpected protocols (file:, blob:, etc.)", () => {
      expect(
        gomiSubscriptionUrl(DISTRICT, HOST, "Mozilla/5.0", "file:"),
      ).toMatch(/^https:/);
    });
  });
});
