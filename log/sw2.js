const CACHE_NAME = 'logradio-v7'; // Incrementiamo la versione
const FILES_TO_CACHE = [
  'log.html',
  'manifest.json',
  'icon-192.png'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Tentativo di salvataggio file...');
      // Carichiamo ogni file singolarmente per evitare il blocco totale
      return Promise.all(
        FILES_TO_CACHE.map((url) => {
          return cache.add(url).catch(err => {
            console.error(`SW: Errore nel caricamento di ${url}. Controlla se il file esiste su GitHub!`);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((response) => {
      return response || fetch(evt.request);
    })
  );
});
