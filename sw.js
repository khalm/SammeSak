// sw.js — gjør appen installerbar (kreves for at den skal dukke opp i Del-menyen)
const VERSION = 'sammesak-1.2.1';
const CORE = ['./', 'index.html', 'style.css', 'config.js', 'paywall.js', 'search.js', 'app.js', 'manifest.json',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-48.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'sammesak-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Skrifttyper: lagres første gang
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.open('sammesak-fonts').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // Egne filer: nett først (får oppdateringer), ellers lagret kopi. Nyhetssøk går alltid rett til nettet.
  if (url.origin === location.origin) {
    // cache: 'no-cache' = spør alltid GitHub om nyeste versjon (ellers kan telefonen bruke gamle filer i opptil 10 min)
    e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok && !url.search) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
