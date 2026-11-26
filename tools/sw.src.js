// Stellarchy service worker (generated into client/sw.js by tools/sync.mjs: VERSION and FILES are filled in).
// Caches the game so solo play works offline and the app can be installed. Online rooms (/api) always use the network.
const VERSION = "__VERSION__", FILES = __FILES__, CACHE = "stellarchy-" + VERSION;
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("stellarchy-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // /r/CODE links open the page itself
  const key = e.request.mode === "navigate" ? "/" : url.pathname;
  e.respondWith(caches.open(CACHE).then(async c => (await c.match(key)) || fetch(e.request).then(r => { if (r.ok && FILES.includes(key)) c.put(key, r.clone()); return r; })));
});
