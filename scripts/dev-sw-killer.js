// koto-city dev-only Service Worker killer — see plan C6

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1. Take control of all open clients first
      await self.clients.claim();

      // 2. Delete every cache belonging to this origin
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((k) => caches.delete(k)));

      // 3. Get all window clients (navigate() only exists on WindowClient)
      const wins = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });

      // 4. Reload each client; ignore errors (client may have navigated away)
      await Promise.all(wins.map((c) => c.navigate(c.url).catch(() => {})));

      // 5. Unregister last so the SW remains valid for step 4
      await self.registration.unregister();
    })()
  );
});
