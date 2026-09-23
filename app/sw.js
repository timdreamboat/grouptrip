// GroupTrip service worker: makes the app installable, keeps it working
// offline (last-seen copy of the app files), and shows push notifications.
const CACHE = 'grouptrip-v4';

// The app's own files. Add new files here so they work offline too.
const SHELL = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './app.js', './config.js', './embeds.js', './money.js', './places.js', './pwa.js', './store.js', './ui.js',
  './views/bizexpenses.js', './views/common.js', './views/cover.js', './views/create.js', './views/flights.js', './views/getapp.js', './views/home.js',
  './views/invite.js', './views/lists.js', './views/me.js', './views/overview.js', './views/people.js',
  './views/photos.js', './views/plan.js', './views/polls.js', './views/stays.js', './views/trip.js',
  './views/today.js', './views/tripmap.js', './views/wallet.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App files: fresh from the network when online, saved copy when offline.
// Fonts: saved copy first (they never change).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
  } else if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'GroupTrip', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'GroupTrip', {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || './' },
  }));
});

// Tapping a notification opens (or focuses) GroupTrip on the right screen.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const win = wins.find((w) => new URL(w.url).origin === location.origin);
    if (win) return win.focus().then(() => win.navigate(url));
    return self.clients.openWindow(url);
  }));
});
