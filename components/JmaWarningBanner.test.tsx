import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import JmaWarningBanner from "./JmaWarningBanner";

// Mock next/link to render a plain <a>
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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

describe("JmaWarningBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing on loading then none when API returns non-ok", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 502 })),
    ) as typeof fetch;
    const { container } = render(<JmaWarningBanner />);
    // Initially loading => renders null
    // After fetch resolves => status none => still null
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when API returns data with no escalated warnings", async () => {
    mockFetch({
      reportDatetime: "2026-06-01T10:00:00+09:00",
      areaCode: "1310800",
      warnings: [
        { code: 10, label: "大雨注意報", tier: "advisory" },
      ],
    });
    const { container } = render(<JmaWarningBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    // Advisory-only => not escalated => renders null
    await vi.waitFor(() => {
      expect(container.querySelector("[role=alert]")).toBeNull();
    });
  });

  it("renders warning banner when API returns a warning-tier entry", async () => {
    mockFetch({
      reportDatetime: "2026-06-01T10:00:00+09:00",
      areaCode: "1310800",
      warnings: [
        { code: 3, label: "大雨警報", tier: "warning" },
      ],
    });
    render(<JmaWarningBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute(
      "aria-label",
      expect.stringContaining("警報発表中"),
    );
    expect(alert).toHaveAttribute(
      "aria-label",
      expect.stringContaining("大雨警報"),
    );
  });

  it("renders special banner when API returns a special-tier entry", async () => {
    mockFetch({
      reportDatetime: "2026-06-01T10:00:00+09:00",
      areaCode: "1310800",
      warnings: [
        { code: 33, label: "大雨特別警報", tier: "special" },
        { code: 3, label: "大雨警報", tier: "warning" },
      ],
    });
    render(<JmaWarningBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute(
      "aria-label",
      expect.stringContaining("特別警報発表中"),
    );
  });

  it("renders nothing when response fails schema guard", async () => {
    mockFetch({ unexpected: "data" });
    const { container } = render(<JmaWarningBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[role=alert]")).toBeNull();
    });
  });
});
