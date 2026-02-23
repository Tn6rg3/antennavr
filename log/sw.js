const CACHE_NAME = 'logradio-v2';
const FILES_TO_CACHE = [
  './',
  './log.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Installa il service worker e salva i file in cache
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Pulisci vecchie cache se ci sono aggiornamenti
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Intercetta le richieste di rete (Offline mode)
self.addEventListener('fetch', (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((response) => {
      return response || fetch(evt.request);
    }).catch(() => {
      return caches.match('./log.html'); // Fallback se manca internet
    })
  );
});
