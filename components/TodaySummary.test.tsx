import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TodaySummary from "./TodaySummary";
import { createProfile } from "@/lib/profiles";
import type { District, SpecialOverlay } from "@/lib/gomi/types";
import type { Event } from "@/lib/events/types";

// Stub /api/weather so the weather section renders deterministically.
function mockWeather(payload: unknown, status = 200): void {
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as typeof fetch;
}

const TOYOSU: District = {
  id: "toyosu",
  label: "豊洲",
  addresses: ["豊洲"],
  schedule: {
    burnable: ["mon", "thu"],
    non_burnable: [],
    resource_plastic: [],
    container_plastic: [],
    pet_bottle: ["fri"],
    bottles_cans: ["fri"],
    bulky: [],
  },
};

const districts: District[] = [TOYOSU];
const overlays: SpecialOverlay[] = [];

const validDailyWeather = {
  latitude: 35.6727,
  longitude: 139.8175,
  timezone: "Asia/Tokyo",
  daily: {
    time: ["2026-05-04", "2026-05-05"],
    temperature_2m_max: [25.0, 26.0],
    temperature_2m_min: [18.0, 19.0],
    precipitation_probability_max: [30, 10],
    weathercode: [1, 2],
  },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("TodaySummary", () => {
  it("prompts to set a profile when none is active", async () => {
    mockWeather(validDailyWeather);
    render(
      <TodaySummary
        districts={districts}
        overlays={overlays}
        upcomingEvents={[]}
      />,
    );
    expect(
      await screen.findByText(/地区プロファイルを設定してください/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /設定画面へ/ }),
    ).toBeInTheDocument();
  });

  it("renders the active profile name and district when one is set", async () => {
    createProfile({ name: "家", districtId: "toyosu" });
    mockWeather(validDailyWeather);
    render(
      <TodaySummary
        districts={districts}
        overlays={overlays}
        upcomingEvents={[]}
      />,
    );
    expect(await screen.findByText("家")).toBeInTheDocument();
    expect(screen.getByText("豊洲")).toBeInTheDocument();
  });

  it("renders weather for today and tomorrow", async () => {
    createProfile({ name: "家", districtId: "toyosu" });
    mockWeather(validDailyWeather);
    render(
      <TodaySummary
        districts={districts}
        overlays={overlays}
        upcomingEvents={[]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/18°〜25°C/)).toBeInTheDocument();
      expect(screen.getByText(/19°〜26°C/)).toBeInTheDocument();
    });
  });

  it("shows the empty event state when no events overlap today", async () => {
    createProfile({ name: "家", districtId: "toyosu" });
    mockWeather(validDailyWeather);
    render(
      <TodaySummary
        districts={districts}
        overlays={overlays}
        upcomingEvents={[]}
      />,
    );
    expect(
      await screen.findByText(/直近の区主催イベントはありません/),
    ).toBeInTheDocument();
  });

  it("renders up to 2 upcoming events", async () => {
    createProfile({ name: "家", districtId: "toyosu" });
    mockWeather(validDailyWeather);
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const futureStr = future.toISOString().slice(0, 10);
    const events: Event[] = [
      {
        id: "e1",
        title: "テストイベント 1",
        startDate: futureStr,
        status: "confirmed",
      },
      {
        id: "e2",
        title: "テストイベント 2",
        startDate: futureStr,
        status: "confirmed",
      },
      {
        id: "e3",
        title: "Should not appear",
        startDate: futureStr,
        status: "confirmed",
      },
    ];
    render(
      <TodaySummary
        districts={districts}
        overlays={overlays}
        upcomingEvents={events}
      />,
    );
    expect(await screen.findByText("テストイベント 1")).toBeInTheDocument();
    expect(screen.getByText("テストイベント 2")).toBeInTheDocument();
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });
});
