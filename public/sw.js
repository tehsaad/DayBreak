/* DAYBREAK service worker.
 * Caching strategy (explicit and deliberately small):
 *  - /_next/static/* (content-hashed, immutable), /icons/*, fonts: cache-first.
 *  - /offline: precached; shown when a page navigation fails because the device is offline.
 *  - HTML pages and /api/* are NEVER cached: they can contain a reader's private paper, so they
 *    always come from the network. This also means users can't get stuck on a stale app version.
 * A new worker activates immediately and deletes older caches.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `daybreak-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("daybreak-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|ttf)$/.test(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    // Network only for pages; the offline page only when the network is unreachable.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Everything else (API, images from publishers, Supabase) goes straight to the network.
});
