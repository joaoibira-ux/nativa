const VERSION = "nativa-v18";
const ASSETS = [
  "./index.html",
  "./menu.html",
  "./clientes.html",
  "./materiaprima.html",
  "./produtos.html",
  "./pedidos.html",
  "./caixa.html",
  "./areceber.html",
  "./apagar.html",
  "./style.css?v=12",
  "./app.js?v=16",
  "./clientes.js?v=2",
  "./estoque.js?v=5",
  "./pedidos.js?v=2",
  "./caixa.js?v=1",
  "./areceber.js?v=1",
  "./apagar.js?v=1",
  "./manifest.json",
  "./logonativa.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
