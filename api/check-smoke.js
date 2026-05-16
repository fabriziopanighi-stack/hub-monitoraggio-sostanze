import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = 'https://fyibnjnqrmgzeozxxsfx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uh8m1jolttETPja2PACa4A_BghkyfoP';

// Configurazione delle credenziali di sicurezza per il protocollo Web Push
webpush.setVapidDetails(
    'mailto:assistente.jarvis.hub@gmail.com',
    'BFrqrPLeS6oS3E6DthusfrfUw_Tv31rBBDuGwWFf9bokGNFZm8xv-jMgPNUjaNwMDUSA2cIEpC6E8jYuQ137nVo',
    'Zna1XZfqnWja0Eez0FOAeVN-ybi69wOJ9T3Lei-4X8s'
);

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // 1. Estrazione dell'ultimo log relativo alle sigarette
        const { data: registrazioni, error: errReg } = await supabase
            .from('registrazioni')
            .select('*')
            .eq('nome', 'Sigaretta')
            .order('created_at', { ascending: false })
            .limit(1);

        if (errReg || !registrazioni || registrazioni.length === 0) {
            return res.status(200).json({ status: 'Nessun log sigaretta rilevato.' });
        }

        const ultimaSigaretta = registrazioni[0];
        const msTrascorsi = Date.now() - new Date(ultimaSigaretta.created_at).getTime();
        const minutiTrascorsi = msTrascorsi / 60000;

        // Se sono trascorsi meno di 120 minuti, l'esecuzione si interrompe senza inviare nulla
        if (minutiTrascorsi < 120) {
            return res.status(200).json({ status: `Soglia non raggiunta. Trascorsi: ${Math.floor(minutiTrascorsi)} minuti.` });
        }

        // 2. Controllo anti-duplicazione: verifica se l'evento è già stato notificato
        const { data: inviate, error: errInv } = await supabase
            .from('notifiche_inviate')
            .select('*')
            .eq('registrazione_id', ultimaSigaretta.id)
            .limit(1);

        if (errInv || (inviate && inviate.length > 0)) {
            return res.status(200).json({ status: 'Notifica per questo evento già inoltrata in precedenza.' });
        }

        // 3. Estrazione dei dispositivi abbonati dal database
        const { data: abbonati, error: errSub } = await supabase
            .from('pwa_subscriptions')
            .select('*');

        if (errSub || !abbonati || abbonati.length === 0) {
            return res.status(200).json({ status: 'Nessun dispositivo registrato nella tabella pwa_subscriptions.' });
        }

        // 4. Compilazione del carico informativo (Payload)
        const payload = JSON.stringify({
            title: 'Health Intelligence',
            body: "Signore, sono trascorse esplicitamente 2 ore dall'ultima sigaretta. Il protocollo di rigenerazione intermedia è attivo."
        });

        // 5. Inoltro simultaneo a tutti i terminali attivi
        for (const sub of abbonati) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (pushErr) {
                console.error("Mancato inoltro a un endpoint:", pushErr.message);
            }
        }

        // 6. Marcatura dell'evento sul database per impedire spam successivo
        await supabase
            .from('notifiche_inviate')
            .insert([{ registrazione_id: ultimaSigaretta.id }]);

        return res.status(200).json({ status: 'Protocollo push eseguito. Notifiche inviate.' });

    } catch (globalError) {
        return res.status(500).json({ error: globalError.message });
    }
}
