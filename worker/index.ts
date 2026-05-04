/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Custom Service Worker handlers for Web Push.
//
// `@ducanh2912/next-pwa` compiles this file (default `customWorkerSrc:
// "worker"`) and prepends it to the generated Workbox SW. We add only the
// `push` and `notificationclick` listeners here — caching is owned by the
// library's `runtimeCaching` config in next.config.ts.
//
// The reference directives above isolate this file's TypeScript lib
// environment to `webworker`, which conflicts with the `dom` lib the rest
// of the project uses. Without the override, `ServiceWorkerGlobalScope`
// is not declared and `self` would have the wrong shape.
//
// Payload contract (set by /api/push/dispatch):
//   { title: string, body: string, url: string, tag: string }

declare const self: ServiceWorkerGlobalScope;

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() as PushPayload) ?? {};
  } catch {
    payload = { title: "通知", body: event.data?.text() ?? "" };
  }
  const title = payload.title || "通知";
  const options: NotificationOptions = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url ?? "/gomi" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | null)?.url ?? "/gomi";
  event.waitUntil(focusOrOpen(targetUrl));
});

async function focusOrOpen(path: string): Promise<void> {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    const clientUrl = new URL(client.url);
    const targetUrl = new URL(path, clientUrl.origin);
    if (clientUrl.origin === targetUrl.origin) {
      await client.focus();
      if ("navigate" in client) {
        await (client as WindowClient).navigate(targetUrl.toString()).catch(
          () => null,
        );
      }
      return;
    }
  }
  await self.clients.openWindow(path);
}
