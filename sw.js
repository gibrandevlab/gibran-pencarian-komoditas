/* Service worker: aplikasi tetap jalan tanpa sinyal.
   Strategi stale-while-revalidate: selalu cepat dari cache, lalu diam-diam memperbarui. */
const SHELL = 'shell-v2';
const DATA = 'data-v1';                          // file besar dipisah supaya instalasi tidak gagal di sinyal jelek
const BIG = 'Master_Komoditas_SPKRT_2027.json';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'worker.js', 'manifest.json', 'komoditas.json'];
const OPTIONAL = ['icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(CORE);
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function swr(e, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request, { ignoreSearch: true });
  const net = fetch(e.request)
    .then(r => {
      // Hanya simpan respons utuh (bukan 206/redirect) agar aman dipakai untuk navigasi
      if (r.status === 200 && !r.redirected) cache.put(e.request, r.clone());
      return r;
    })
    .catch(() => null);

  if (hit) { e.waitUntil(net); return hit; }

  const r = await net;
  if (r) return r;
  if (e.request.mode === 'navigate') {
    const shell = await caches.match('./', { ignoreSearch: true });
    if (shell) return shell;
  }
  return Response.error();
}

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/_vercel/')) return;
  e.respondWith(swr(e, u.pathname.endsWith('/' + BIG) ? DATA : SHELL));
});
