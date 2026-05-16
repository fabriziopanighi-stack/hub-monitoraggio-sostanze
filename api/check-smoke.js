import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Richiamo sicuro delle credenziali dal server di Vercel
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

webpush.setVapidDetails(
    'mailto:assistente.jarvis.hub@gmail.com',
    'BFrqrPLeS6oS3E6DthusfrfUw_Tv31rBBDuGwWFf9bokGNFZm8xv-jMgPNUjaNwMDUSA2cIEpC6E8jYuQ137nVo',
    'Zna1XZfqnWja0Eez0FOAeVN-ybi69wOJ9T3Lei-4X8s'
);

export default async function handler(req, res) {
    // Blocco di sicurezza: impedisce l'esecuzione se le chiavi non sono caricate
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: "Credenziali d'ambiente mancanti su Vercel." });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
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

        if (minutiTrascorsi < 120) {
            return res.status(200).json({ status: `Soglia non raggiunta. Trascorsi: ${Math.floor(minutiTrascorsi)} minuti.` });
        }

        const { data: inviate, error: errInv } = await supabase
            .from('notifiche_inviate')
            .select('*')
            .eq('registrazione_id', ultimaSigaretta.id)
            .limit(1);

        if (errInv || (inviate && inviate.length > 0)) {
            return res.status(200).json({ status: 'Notifica per questo evento già inoltrata in precedenza.' });
        }

        const { data: abbonati, error: errSub } = await supabase
            .from('pwa_subscriptions')
            .select('*');

        if (errSub || !abbonati || abbonati.length === 0) {
            return res.status(200).json({ status: 'Nessun dispositivo registrato nella tabella pwa_subscriptions.' });
        }

        const payload = JSON.stringify({
            title: 'Health Intelligence',
            body: "Signore, sono trascorse esplicitamente 2 ore dall'ultima sigaretta. Il protocollo di rigenerazione intermedia è attivo."
        });

        for (const sub of abbonati) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (pushErr) {
                console.error("Mancato inoltro a un endpoint:", pushErr.message);
            }
        }

        await supabase
            .from('notifiche_inviate')
            .insert([{ registrazione_id: ultimaSigaretta.id }]);

        return res.status(200).json({ status: 'Protocollo push eseguito. Notifiche inviate.' });

    } catch (globalError) {
        return res.status(500).json({ error: globalError.message });
    }
}
