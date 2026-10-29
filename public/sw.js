const VERSION = 'v1';
const SHELL_CACHE = 'narvelo-shell-' + VERSION;
const IMG_CACHE = 'narvelo-img-' + VERSION;
const MAX_IMAGES = 200;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.json']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // البيانات دايماً من النت

  // بوسترات الأفلام: من الكاش لو موجودة
  if (url.pathname.startsWith('/img/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          trimCache(cache, MAX_IMAGES);
        }
        return res;
      }),
    );
    return;
  }

  // ملفات الموقع المبنية (أسماءها فيها hash، فآمن نكاشها)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // الصفحات: دايماً من النت أولاً (عشان الـ SEO والتحديثات)، والكاش لو مفيش نت
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/').then((r) => r || new Response('أنت غير متصل بالإنترنت', { status: 503 })),
      ),
    );
  }
});
