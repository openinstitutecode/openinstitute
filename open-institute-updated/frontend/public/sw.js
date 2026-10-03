// LMS026 — PWA support. A minimal, real service worker: it doesn't know
// the build's hashed asset filenames ahead of time (no Vite plugin wired
// up to generate a precache manifest here), so instead of a fake/broken
// precache list it does runtime caching — cache-first for static assets
// (JS/CSS/fonts/images) and network-first for API calls, falling back to
// cache when offline. This, plus manifest.json and the <link rel="manifest">
// in index.html, is what makes the app installable and gives it something
// to serve when the network drops — not full precached offline-first,
// which LMS024's per-lesson IndexedDB cache handles for lesson content.
const CACHE_NAME = "measur-shell-v2";
const STATIC_DEST = new Set(["style", "script", "font", "image"]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API calls: network-first, so data is never stale by default; fall back
  // to the last cached response only when there's genuinely no connection.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Static assets (the app shell): cache-first for speed and offline reload.
  if (STATIC_DEST.has(req.destination)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
  }
});
