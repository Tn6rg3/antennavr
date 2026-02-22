const CACHE_NAME = 'ar-antenna-v3';
const ASSETS_TO_CACHE = [
  './',
  './ant.html',
  './manifest.json',
  // File esterni di Three.js salvati in cache
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Download file per uso offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Ritorna il file dalla cache (se c'è) o lo scarica da internet
      return response || fetch(event.request);
    })
  );
});
