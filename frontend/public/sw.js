const CACHE_NAME = 'almumtaz-crm-cache-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon.png',
  '/src/main.ts', // Let Vite handle module loading in dev, service worker caches compiled assets in production.
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First, fallback to cache)
self.addEventListener('fetch', (e) => {
  // Only handle GET requests and skip API requests
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache the updated version
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => caches.match(e.request).then((cachedRes) => cachedRes))
  );
});

// Push Event for Web Notification API
self.addEventListener('push', (e) => {
  let data = { title: 'Al-Mumtaz CRM', message: 'Ada notifikasi baru.' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'Al-Mumtaz CRM', message: e.data.text() };
    }
  }

  const options = {
    body: data.message,
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
