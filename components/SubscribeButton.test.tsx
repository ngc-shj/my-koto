import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SubscribeButton from "./SubscribeButton";

beforeEach(() => {
  // jsdom defaults: window.location.host="localhost", navigator.userAgent="Mozilla/...".
  // Stub clipboard so handleCopy() can run without a permission prompt.
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("SubscribeButton", () => {
  it("renders the placeholder/disabled link before the URL is computed", () => {
    render(<SubscribeButton districtId="kameido-1-3" />);
    // The non-disabled <a> renders only after useEffect runs; on the very
    // first paint we expose a <span aria-disabled="true"> so SSR HTML and
    // first hydration tick are stable (F-13).
    const placeholder = screen.queryByText("カレンダーに登録");
    expect(placeholder).toBeInTheDocument();
  });

  it("computes the subscribe URL after mount and exposes it via the link href", async () => {
    render(<SubscribeButton districtId="kameido-1-3" />);
    const link = await screen.findByRole("link", { name: /カレンダーに登録/ });
    const href = link.getAttribute("href");
    expect(href).not.toBeNull();
    expect(href).toContain("/api/ics/gomi/kameido-1-3");
    // jsdom default UA is not iOS, so the scheme should be https://.
    expect(href).toMatch(/^https:\/\//);
  });

  it("copies the subscribe URL to the clipboard when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SubscribeButton districtId="kameido-1-3" />);
    const button = await screen.findByRole("button", { name: /URL をコピー/ });
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const arg = writeText.mock.calls[0]?.[0] as string;
    expect(arg).toContain("/api/ics/gomi/kameido-1-3");
  });
});
