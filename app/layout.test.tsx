import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DEV_SW_KILL_SCRIPT } from "@/lib/dev-sw-kill";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "test-nonce" }),
}));

// next/navigation is required by some Next.js internals in test environments
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

// globals.css import will fail in vitest; stub it out
vi.mock("./globals.css", () => ({}));

describe("RootLayout — dev mode emits SW kill script", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("includes DEV_SW_KILL_SCRIPT and nonce in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { default: RootLayout } = await import("@/app/layout");
    const element = await RootLayout({ children: React.createElement("div") });
    const html = renderToString(element);

    expect(html).toContain(DEV_SW_KILL_SCRIPT);
    expect(html).toMatch(/nonce="test-nonce"/);
  });

  it("does not include kc:flag:v1:dev-sw-killed in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { default: RootLayout } = await import("@/app/layout");
    const element = await RootLayout({ children: React.createElement("div") });
    const html = renderToString(element);

    expect(html).not.toContain("kc:flag:v1:dev-sw-killed");
  });
});
