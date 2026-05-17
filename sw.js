const CACHE_NAME = 'health-intelligence-v5.3';
const ASSETS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json'
];

// 1. Installazione e memorizzazione
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. Attivazione e PURGA DELLE VECCHIE CACHE
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName); // Distrugge le versioni 5.2 e precedenti
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. INTERCETTORE NETWORK-FIRST: Scarica sempre dal server se c'è linea
self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
    }
});

// 4. Ricezione dei segnali push remoti (Invariato)
self.addEventListener('push', function(event) {
    let payload = { title: "Health Intelligence", body: "Soglia temporale superata." };
    
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }
    
    const options = {
        body: payload.body,
        icon: './icon.png',
        badge: './icon.png',
        vibrate: [300, 100, 300],
        data: { dateOfArrival: Date.now() }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});
