import { describe, it, expect } from "vitest";
import { swRuntimeCaching } from "./sw-runtime-caching";

describe("swRuntimeCaching", () => {
  const rules = swRuntimeCaching("test123");

  const weatherRule = rules.find(
    (r) => r.handler === "StaleWhileRevalidate"
  );
  const icsRule = rules.find(
    (r) =>
      r.handler === "NetworkOnly" &&
      typeof r.urlPattern !== "string" &&
      typeof r.urlPattern !== "function"
  );

  describe("weather rule", () => {
    it("exists and uses StaleWhileRevalidate", () => {
      expect(weatherRule).toBeDefined();
    });

    it("has cacheName weather-test123", () => {
      expect(weatherRule?.options?.cacheName).toBe("weather-test123");
    });

    it("matches http://x/api/weather", () => {
      const pattern = weatherRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/weather")).toBe(true);
    });

    it("matches http://x/api/weather?lang=ja", () => {
      const pattern = weatherRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/weather?lang=ja")).toBe(true);
    });

    it("does not match http://x/api/weatherings", () => {
      const pattern = weatherRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/weatherings")).toBe(false);
    });

    it("does not match http://x/api/weather-archive", () => {
      const pattern = weatherRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/weather-archive")).toBe(false);
    });

    it("does not match http://x/api/weather/foo", () => {
      const pattern = weatherRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/weather/foo")).toBe(false);
    });
  });

  describe("ics rule", () => {
    it("exists and uses NetworkOnly", () => {
      expect(icsRule).toBeDefined();
    });

    it("matches http://x/api/ics/events", () => {
      const pattern = icsRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/ics/events")).toBe(true);
    });

    it("matches http://x/api/ics/gomi/my-koto", () => {
      const pattern = icsRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/ics/gomi/my-koto")).toBe(true);
    });

    it("does not match http://x/api/ics (no trailing path segment)", () => {
      const pattern = icsRule!.urlPattern as RegExp;
      expect(pattern.test("http://x/api/ics")).toBe(false);
    });
  });
});
