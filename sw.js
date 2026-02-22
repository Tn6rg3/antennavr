const CACHE_NAME = 'ham-radio-planner-v1';
// Elenco dei file da salvare per l'uso offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './libs/three.module.js',
  './libs/jsm/ARButton.js'
];

// Fase di installazione: scarica i file in cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aperta: salvataggio file...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Fase di attivazione: pulisce vecchie versioni della cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Intercettazione richieste: se sei offline, usa la cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se il file è in cache, caricalo, altrimenti prova la rete
        return response || fetch(event.request);
      })
  );
});
