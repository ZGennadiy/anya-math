// Stale-while-revalidate for every same-origin GET. A fetch handler is what makes the game
// installable; the cache is what makes it open without network after the first visit.
// ponytail: no precache list and no cache version. A cold first visit offline shows nothing, and a
// deploy arrives on the second launch. Add a build-generated precache manifest if that matters.
const CACHE = 'anya-math';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request)
      .then(response => { if (response.ok) cache.put(request, response.clone()); return response; })
      .catch(() => cached ?? Response.error());
    return cached ?? fresh;
  }));
});
