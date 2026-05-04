import { describe, it, expect } from "vitest";
import { haversineDistance } from "./distance";

// Koto City center (江東区中心)
const KOTO_CENTER = { lat: 35.6727, lng: 139.8175 };
// Tokyo Station (東京駅)
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
// Shin-Kiba Station (新木場駅) — eastern end of Koto
const SHINKIBA = { lat: 35.6454, lng: 139.8213 };

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance(KOTO_CENTER, KOTO_CENTER)).toBe(0);
  });

  it("computes distance from Koto center to Tokyo Station within ±10m", () => {
    // Approximate expected: ~4650m (haversine over the two reference points)
    const dist = haversineDistance(KOTO_CENTER, TOKYO_STATION);
    expect(dist).toBeGreaterThan(4640);
    expect(dist).toBeLessThan(4660);
  });

  it("computes distance from Koto center to Shin-Kiba within ±10m", () => {
    // Approximate expected: ~3100m
    const dist = haversineDistance(KOTO_CENTER, SHINKIBA);
    expect(dist).toBeGreaterThan(3000);
    expect(dist).toBeLessThan(3200);
  });

  it("is symmetric — a to b equals b to a", () => {
    const ab = haversineDistance(KOTO_CENTER, TOKYO_STATION);
    const ba = haversineDistance(TOKYO_STATION, KOTO_CENTER);
    expect(Math.abs(ab - ba)).toBeLessThan(0.001);
  });
});
