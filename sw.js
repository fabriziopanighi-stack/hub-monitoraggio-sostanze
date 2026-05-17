const CACHE_NAME = 'health-intelligence-v5.2';
const ASSETS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json'
];

// 1. Installazione e memorizzazione degli asset locali
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. Attivazione immediata del controllo dei client
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 3. INTERCETTORE SELETTIVO: Risolve il blocco della comunicazione con Supabase
self.addEventListener('fetch', (event) => {
    // Il Service Worker deve gestire esclusivamente le richieste GET interne al proprio dominio.
    // I metodi di scrittura (POST, DELETE) e le chiamate API esterne a Supabase devono viaggiare libere.
    if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});

// 4. Ricezione dei segnali push remoti
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
