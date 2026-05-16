import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = 'https://fyibnjnqrmgzeozxxsfx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uh8m1jolttETPja2PACa4A_BghkyfoP';

webpush.setVapidDetails(
    'mailto:assistente.jarvis.hub@gmail.com',
    'BFrqrPLeS6oS3E6DthusfrfUw_Tv31rBBDuGwWFf9bokGNFZm8xv-jMgPNUjaNwMDUSA2cIEpC6E8jYuQ137nVo',
    'Zna1XZfqnWja0Eez0FOAeVN-ybi69wOJ9T3Lei-4X8s'
);

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // 1. Estrazione delle consumazioni alcoliche nelle ultime 24 ore
        const unGiornoFa = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: consumazioni, error: errAlc } = await supabase
            .from('registrazioni')
            .select('*')
            .neq('nome', 'Sigaretta')
            .gt('created_at', unGiornoFa)
            .order('created_at', { ascending: false });

        if (errAlc || !consumazioni || consumazioni.length === 0) {
            return res.status(200).json({ status: 'Nessun log alcolico recente rilevato.' });
        }

        const ultimoAlcolico = consumazioni[0];
        const oraAttuale = Date.now();

        // Algoritmo di calcolo BAC v5.2 conforme al modulo client
        const calcolaBACaTempo = (targetTime) => {
            let totale = 0;
            consumazioni.forEach(item => {
                const match = item.quantita.match(/(\d+\.\d+)g/);
                if (match) {
                    const g = parseFloat(match[1]);
                    const ore = (targetTime - new Date(item.created_at).getTime()) / 3600000;
                    if (ore >= 0) {
                        const bacIniziale = g * 0.0154;
                        let residuo = 0;
                        if (ore <= 0.75) {
                            residuo = (bacIniziale * (ore / 0.75)) - (ore * 0.15);
                        } else {
                            residuo = bacIniziale - (ore * 0.15);
                        }
                        totale += Math.max(0, residuo);
                    }
                }
            });
            return totale;
        };

        const bacAttuale = calcolaBACaTempo(oraAttuale);

        // Se il tasso è ancora superiore allo 0.5, il controllo si interrompe
        if (bacAttuale > 0.5) {
            return res.status(200).json({ status: `Tasso superiore al limite. BAC: ${bacAttuale.toFixed(2)} g/l` });
        }

        // 2. Verifica anti-duplicazione per l'evento corrente
        const { data: inviate, error: errInv } = await supabase
            .from('notifiche_inviate')
            .select('*')
            .eq('registrazione_id', ultimoAlcolico.id)
            .limit(1);

        if (errInv || (inviate && inviate.length > 0)) {
            return res.status(200).json({ status: 'Notifica di rientro già inoltrata per questa sessione.' });
        }

        // 3. Verifica se il tasso ha effettivamente superato la soglia critica durante il picco (45 min dopo il log)
        const tempoPicco = new Date(ultimoAlcolico.created_at).getTime() + 45 * 60 * 1000;
        const bacAlPicco = calcolaBACaTempo(tempoPicco);

        if (bacAlPicco <= 0.5) {
            return res.status(200).json({ status: 'Il picco teorico non ha mai superato lo 0.5 g/l. Allerta non necessaria.' });
        }

        // 4. Inoltro del segnale push al dispositivo mobile
        const { data: abbonati, error: errSub } = await supabase
            .from('pwa_subscriptions')
            .select('*');

        if (errSub || !abbonati || abbonati.length === 0) {
            return res.status(200).json({ status: 'Nessun dispositivo registrato per la ricezione.' });
        }

        const payload = JSON.stringify({
            title: 'Health Intelligence',
            body: `Signore, il Suo tasso alcolemico stimato è rientrato a ${bacAttuale.toFixed(2)} g/l. Stato idoneo alla guida autorizzato.`
        });

        for (const sub of abbonati) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (pushErr) {
                console.error("Latenza endpoint:", pushErr.message);
            }
        }

        // 5. Archiviazione ID log per prevenire cicli di invio infiniti
        await supabase
            .from('notifiche_inviate')
            .insert([{ registrazione_id: ultimoAlcolico.id }]);

        return res.status(200).json({ status: 'Protocollo di rientro eseguito. Notifica inoltrata.' });

    } catch (globalError) {
        return res.status(500).json({ error: globalError.message });
    }
}
