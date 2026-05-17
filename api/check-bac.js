import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

webpush.setVapidDetails(
    'mailto:assistente.jarvis.hub@gmail.com',
    'BFrqrPLeS6oS3E6DthusfrfUw_Tv31rBBDuGwWFf9bokGNFZm8xv-jMgPNUjaNwMDUSA2cIEpC6E8jYuQ137nVo',
    'Zna1XZfqnWja0Eez0FOAeVN-ybi69wOJ9T3Lei-4X8s'
);

export default async function handler(req, res) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: "Credenziali d'ambiente mancanti su Vercel." });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
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
        const tempoPicco = new Date(ultimoAlcolico.created_at).getTime() + 45 * 60 * 1000;

        const calcolaBACaTempo = (targetTime) => {
            const logOrdinati = [...consumazioni].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const timeInizio = new Date(logOrdinati[0].created_at).getTime();
            
            let bacAttuale = 0;
            let timeCursor = timeInizio;
            const stepMs = 5 * 60 * 1000;
            
            const drinks = logOrdinati.map(item => {
                const match = item.quantita.match(/(\d+\.\d+)g/);
                const g = match ? parseFloat(match[1]) : 0;
                return { time: new Date(item.created_at).getTime(), bacMax: g * 0.0245 };
            });

            while (timeCursor <= targetTime) {
                let bacAggiuntoNelloStep = 0;
                drinks.forEach(drink => {
                    if (timeCursor > drink.time && timeCursor <= drink.time + (45 * 60 * 1000)) {
                        bacAggiuntoNelloStep += (drink.bacMax / 9);
                    }
                });
                
                bacAttuale += bacAggiuntoNelloStep;
                
                if (bacAttuale > 0) {
                    bacAttuale -= (0.15 / 12);
                    if (bacAttuale < 0) bacAttuale = 0;
                }
                
                timeCursor += stepMs;
            }
            return bacAttuale;
        };

        const bacAttuale = calcolaBACaTempo(oraAttuale);

        // 1. BLOCCO ASSORBIMENTO: Se siamo prima del picco, l'alcol sta ancora salendo. Interrompi l'esecuzione.
        if (oraAttuale < tempoPicco) {
            return res.status(200).json({ status: 'Fase di assorbimento in corso. Curva in salita.' });
        }

        // 2. BLOCCO LIMITE: Se dopo il picco siamo ancora sopra lo 0.5, interrompi.
        if (bacAttuale > 0.5) {
            return res.status(200).json({ status: `Tasso superiore al limite. BAC: ${bacAttuale.toFixed(2)} g/l` });
        }

        // 3. VERIFICA PICCO TEORICO: Controlla se il picco aveva effettivamente superato lo 0.5 per giustificare una notifica.
        const bacAlPicco = calcolaBACaTempo(tempoPicco);
        if (bacAlPicco <= 0.5) {
            return res.status(200).json({ status: 'Il picco non ha mai superato lo 0.5 g/l. Allerta non necessaria.' });
        }

        // 4. VERIFICA DUPLICATI:
        const { data: inviate, error: errInv } = await supabase
            .from('notifiche_inviate')
            .select('*')
            .eq('registrazione_id', ultimoAlcolico.id)
            .limit(1);

        if (errInv || (inviate && inviate.length > 0)) {
            return res.status(200).json({ status: 'Notifica di rientro già inoltrata per questa sessione.' });
        }

        const { data: abbonati, error: errSub } = await supabase
            .from('pwa_subscriptions')
            .select('*');

        if (!errSub && abbonati && abbonati.length > 0) {
            const payload = JSON.stringify({
                title: 'Health Intelligence',
                body: `Signore, il Suo tasso alcolemico stimato è sceso a ${bacAttuale.toFixed(2)} g/l. Stato idoneo alla guida autorizzato.`
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
        }

        await supabase.from('notifiche_inviate').insert([{ registrazione_id: ultimoAlcolico.id }]);
        return res.status(200).json({ status: 'Protocollo di rientro eseguito.' });

    } catch (globalError) {
        return res.status(500).json({ error: globalError.message });
    }
}
