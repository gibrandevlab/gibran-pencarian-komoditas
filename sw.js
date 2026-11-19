const SHELL = 'shell-v1', DATA = 'data-v1';
const SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'komoditas.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function swr(e, name) {
  return caches.open(name).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request)
      .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) ||
      (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
  });
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/_vercel/')) return;
  const big = u.pathname.endsWith('Master_Komoditas_SPKRT_2027.json');
  e.respondWith(swr(e, big ? DATA : SHELL));
});