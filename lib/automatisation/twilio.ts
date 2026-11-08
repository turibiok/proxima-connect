/**
 * Twilio : envoi de SMS et de messages WhatsApp, verification des requetes
 * recues (reponses des intervenants).
 *
 * Sans dependance : l'API REST de Twilio s'appelle avec fetch.
 * Documentation : https://www.twilio.com/docs/messaging/api/message-resource
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface IdentifiantsTwilio {
  sid: string;
  token: string;
}

/**
 * Envoie un message. `de` et `a` au format international (+229…) ; pour
 * WhatsApp, prefixes « whatsapp: ». Retourne l'identifiant du message.
 *
 * Attention WhatsApp : hors de la fenetre de 24 h ouverte par un message de
 * l'intervenant, Meta n'accepte que des modeles de message approuves.
 */
export async function envoyerTwilio(
  id: IdentifiantsTwilio,
  m: { canal: 'sms' | 'whatsapp'; de: string; a: string; texte: string },
  f: typeof fetch = fetch,
): Promise<{ ok: true; ref: string } | { ok: false; erreur: string }> {
  const prefixe = m.canal === 'whatsapp' ? 'whatsapp:' : '';
  const corps = new URLSearchParams({ From: `${prefixe}${m.de}`, To: `${prefixe}${m.a}`, Body: m.texte });
  try {
    const r = await f(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(id.sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id.sid}:${id.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corps,
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!r.ok || !j.sid) return { ok: false, erreur: `Twilio ${r.status}${j.code ? ` (${j.code})` : ''} : ${j.message ?? 'refus sans détail'}` };
    return { ok: true, ref: j.sid };
  } catch (e) {
    return { ok: false, erreur: `Twilio injoignable : ${e instanceof Error ? e.message : 'erreur réseau'}` };
  }
}

/**
 * Signature d'une requete envoyee par Twilio (en-tete X-Twilio-Signature) :
 * HMAC-SHA1, cle = jeton du compte, sur l'URL suivie des parametres tries
 * (nom puis valeur, concatenes), en base64.
 */
export function signatureTwilio(token: string, url: string, params: Record<string, string>): string {
  const donnees = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(donnees, 'utf8').digest('base64');
}

/** Comparaison a temps constant de la signature recue. */
export function signatureValide(token: string, url: string, params: Record<string, string>, recue: string | null): boolean {
  if (!recue) return false;
  const attendue = Buffer.from(signatureTwilio(token, url, params));
  const donnee = Buffer.from(recue);
  return attendue.length === donnee.length && timingSafeEqual(attendue, donnee);
}
