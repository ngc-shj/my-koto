import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import WbgtPanel from "./WbgtPanel";

function mockFetch(json: unknown, status = 200): void {
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(json), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as typeof fetch;
}

describe("WbgtPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the loading state on first paint", () => {
    mockFetch({ fetchedAt: "", readings: [] });
    render(<WbgtPanel />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("shows 危険 band for WBGT >= 31", async () => {
    mockFetch({
      fetchedAt: "2026/08/01 12:00",
      readings: [
        { station: "44132", datetime: "2026-08-01T12:00:00+09:00", wbgt: 32.5 },
      ],
    });
    render(<WbgtPanel />);
    expect(await screen.findAllByText("危険")).toHaveLength(2); // hero + table row
    // 32.5 appears twice (hero number + table row); just assert it's there.
    expect(screen.getAllByText(/32\.5/).length).toBeGreaterThan(0);
  });

  it("shows 警戒 band for WBGT in [25, 28)", async () => {
    mockFetch({
      fetchedAt: "2026/06/15 10:00",
      readings: [
        { station: "44132", datetime: "2026-06-15T10:00:00+09:00", wbgt: 26.0 },
      ],
    });
    render(<WbgtPanel />);
    expect(await screen.findAllByText("警戒")).toHaveLength(2);
  });

  it("shows ほぼ安全 band for low WBGT", async () => {
    mockFetch({
      fetchedAt: "2026/01/15 10:00",
      readings: [
        { station: "44132", datetime: "2026-01-15T10:00:00+09:00", wbgt: 12.5 },
      ],
    });
    render(<WbgtPanel />);
    expect(await screen.findAllByText("ほぼ安全")).toHaveLength(2);
  });

  it("falls back to the 環境省 link on error", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 502 })),
    ) as typeof fetch;
    render(<WbgtPanel />);
    expect(await screen.findByText(/取得に失敗/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /環境省 熱中症予防情報サイト/ }),
    ).toBeInTheDocument();
  });

  it("treats an empty readings array as no-data and offers the upstream link", async () => {
    mockFetch({ fetchedAt: "2026/08/01 12:00", readings: [] });
    render(<WbgtPanel />);
    expect(await screen.findByText(/取得に失敗/)).toBeInTheDocument();
  });
});
