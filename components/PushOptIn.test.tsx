import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PushOptIn, { urlBase64ToUint8Array } from "./PushOptIn";

// jsdom does not implement serviceWorker, PushManager, or Notification by
// default. We attach minimal stubs to `window` / `navigator` per test so we
// can exercise each render path without spinning up a real worker.

function stubBrowserApis(opts: {
  serviceWorker?: boolean;
  pushManager?: boolean;
  notification?: NotificationPermission | null;
  hasSubscription?: boolean;
}) {
  const { serviceWorker = true, pushManager = true, notification = "default", hasSubscription = false } =
    opts;

  if (serviceWorker) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi
              .fn()
              .mockResolvedValue(hasSubscription ? { endpoint: "x" } : null),
            subscribe: vi.fn(),
          },
        }),
      },
    });
  } else {
    // delete the property to simulate unsupported environments
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  }

  if (pushManager) {
    (window as unknown as { PushManager?: unknown }).PushManager = function () {};
  } else {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  }

  if (notification != null) {
    (window as unknown as { Notification?: unknown }).Notification = {
      permission: notification,
      requestPermission: vi.fn().mockResolvedValue(notification),
    };
  } else {
    delete (window as unknown as { Notification?: unknown }).Notification;
  }
}

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 string back to its bytes", () => {
    // "hello" -> base64 "aGVsbG8=" -> URL-safe "aGVsbG8" (padding stripped)
    const out = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });
});

describe("PushOptIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the unsupported message when PushManager is missing", async () => {
    stubBrowserApis({ pushManager: false });
    render(<PushOptIn districtId="toyosu" />);
    expect(
      await screen.findByText(/プッシュ通知に対応していません/),
    ).toBeInTheDocument();
  });

  it("prompts the user to pick a district when none is set", async () => {
    stubBrowserApis({});
    render(<PushOptIn districtId={null} />);
    expect(
      await screen.findByText(/ごみ収集地区を選択してください/),
    ).toBeInTheDocument();
  });

  it("shows the enable button when permission is default and a district is set", async () => {
    stubBrowserApis({ notification: "default" });
    render(<PushOptIn districtId="toyosu" />);
    expect(
      await screen.findByRole("button", { name: /通知を有効にする/ }),
    ).toBeInTheDocument();
  });

  it("shows the denied message when notifications are blocked", async () => {
    stubBrowserApis({ notification: "denied" });
    render(<PushOptIn districtId="toyosu" />);
    expect(
      await screen.findByText(/通知がブロックされています/),
    ).toBeInTheDocument();
  });

  it("shows the disable button when an active subscription exists", async () => {
    stubBrowserApis({ notification: "granted", hasSubscription: true });
    render(<PushOptIn districtId="toyosu" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /通知を無効にする/ }),
      ).toBeInTheDocument(),
    );
  });
});
