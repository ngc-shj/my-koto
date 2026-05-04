import { describe, it, expect } from "vitest";
import { gomiSubscriptionUrl } from "./url";

const HOST = "koto.example.com";
const DISTRICT = "kameido-1";

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
});
