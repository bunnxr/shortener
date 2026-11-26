// Service worker: lets the shortener install as an app (and appear in the phone's Share menu).
// It only keeps a copy of the app's own files (network first, so updates always win) and never
// touches /_api/. Same approach as r2-files/public/sw.js.
const CACHE = "links-shell-v1";
const SHELL = ["/", "/style.css", "/app.js", "/icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => fetch(u, { credentials: "same-origin" }).then((r) => { if (r.ok && r.type === "basic") return c.put(u, r); }).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/_api/") || u.pathname === "/sw.js") return;
  e.respondWith(fetch(r).then((res) => { if (res.ok && res.type === "basic" && !u.search) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r, { ignoreSearch: r.mode === "navigate" }).then((m) => m || (r.mode === "navigate" ? caches.match("/") : undefined))));
});
