// Service Worker: macht die App offline nutzbar.
// Strategie: online immer zuerst die aktuelle Version vom Server holen (network-first),
// nur ohne Verbindung (oder bei sehr langsamer) aus dem Offline-Speicher laden.
// Neue Versionen werden sofort aktiv; die Seite lädt sich dann selbst neu.
const VERSION = 'v1.3.0';
const CACHE = `karteikarten-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/srs.js',
  './js/parser.js',
  './js/score.js',
  './packs/sct.json',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting(); // nicht auf das Schließen aller Fenster warten
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('karteikarten-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

async function networkFirst(url, cacheKey) {
  const cache = await caches.open(CACHE);
  // „no-cache“: beim Server nachfragen, ob es eine neue Version gibt (sonst 304, sehr schnell)
  const fromNetwork = fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  });
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  if (!cached) return fromNetwork; // nichts im Speicher: auf das Netz warten
  const offline = fromNetwork.catch(() => cached);
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
  return Promise.race([offline, slow]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(url.href, './index.html'));
    return;
  }
  e.respondWith(networkFirst(url.href, url.href));
});
