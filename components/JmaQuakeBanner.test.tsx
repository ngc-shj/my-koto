import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import JmaQuakeBanner from "./JmaQuakeBanner";

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

function recentQuake(shindo: string) {
  return {
    eventId: "evt1",
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    epicenter: "東京湾",
    magnitude: 4.2,
    maxShindo: shindo,
    kotoShindo: shindo,
  };
}

describe("JmaQuakeBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when API returns non-ok", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 502 })),
    ) as typeof fetch;
    const { container } = render(<JmaQuakeBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when no recent quakes qualify", async () => {
    mockFetch({
      events: [
        {
          eventId: "evt1",
          occurredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // >24h ago
          epicenter: "東京湾",
          magnitude: 4.2,
          maxShindo: "3",
          kotoShindo: "3",
        },
      ],
    });
    const { container } = render(<JmaQuakeBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[role=alert]")).toBeNull();
    });
  });

  it("renders banner for recent shindo 3 quake", async () => {
    mockFetch({ events: [recentQuake("3")] });
    render(<JmaQuakeBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute(
      "aria-label",
      expect.stringContaining("震度 3"),
    );
    expect(alert).toHaveAttribute(
      "aria-label",
      expect.stringContaining("東京湾"),
    );
  });

  it("renders nothing for shindo 1 (below threshold)", async () => {
    mockFetch({ events: [recentQuake("1")] });
    const { container } = render(<JmaQuakeBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[role=alert]")).toBeNull();
    });
  });

  it("renders nothing when response fails schema guard", async () => {
    mockFetch({ unexpected: "data" });
    const { container } = render(<JmaQuakeBanner />);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[role=alert]")).toBeNull();
    });
  });
});
