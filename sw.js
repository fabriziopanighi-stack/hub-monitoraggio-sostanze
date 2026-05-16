const CACHE_NAME = 'health-intelligence-v5.2';
const ASSETS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json'
];

// 1. Evento di installazione: memorizzazione degli asset fondamentali
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. Evento di attivazione e pulizia delle vecchie cache
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 3. Intercettore di rete (FETCH): Requisito tassativo per lo stato di PWA
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// 4. Ascoltatore dei segnali push remoti inviati da Supabase (Preservato)
self.addEventListener('push', function(event) {
    let payload = { title: "Health Intelligence", body: "Soglia temporale superata, Signore." };
    
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
