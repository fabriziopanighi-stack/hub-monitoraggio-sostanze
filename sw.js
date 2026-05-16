// Ascoltatore dei segnali push remoti inviati da Supabase
self.addEventListener('push', function(event) {
    // Impostazione di un messaggio di default in caso di payload vuoto
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
