/* Lazi Trail service worker: makes the game load fast and work offline after the first visit.
 *  - Game files (models, textures, audio, skies, scripts) are cached the first time they are used
 *    and then served from the cache.
 *  - Pages are fetched from the network first, so a new release shows up on the next visit; the
 *    cached copy is used only when offline.
 * __BUILD_ID__ is replaced at build time, so every release starts with a fresh cache. */
const BUILD = '__BUILD_ID__';
const CORE = `lazi-core-${BUILD}`;
const RUNTIME = `lazi-runtime-${BUILD}`;
const SHELL = [
  './',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

/** Cache the page shell and the script/style bundles it names (their file names carry a hash). */
async function precache() {
  const cache = await caches.open(CORE);
  await cache.addAll(SHELL);
  const html = await (await fetch('./', { cache: 'reload' })).text();
  const bundles = [...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map((m) => m[1]);
  await Promise.all(bundles.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CORE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else the game asks for: cache first, fill the cache on a miss.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
