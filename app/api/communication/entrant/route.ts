import { requete, une } from '@/lib/db';
import { configFournisseur, lireReponseSms } from '@/lib/automatisation/regles';
import { signatureValide } from '@/lib/automatisation/twilio';
import { adressePublique } from '@/lib/automatisation/envoi';
import { enregistrerReponse } from '@/lib/automatisation/reponses';

/**
 * Messages recus des intervenants (SMS ou WhatsApp), transmis par Twilio.
 * A declarer dans la console Twilio comme webhook « A message comes in » :
 *   POST https://<site>/api/communication/entrant
 *
 * La signature Twilio est verifiee : sans elle, n'importe qui pourrait
 * accepter une mission au nom d'un intervenant. Le message est trace dans
 * son historique ; un OUI ou un NON repond a sa proposition en attente.
 */
export const dynamic = 'force-dynamic';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reponseTwiml = (message?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${xml(message)}</Message>` : ''}</Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });

export async function POST(req: Request) {
  const config = configFournisseur(process.env);
  if (config.mode !== 'twilio') return new Response('Réception désactivée.', { status: 404 });

  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  const url = `${await adressePublique()}${new URL(req.url).pathname}`;
  if (!signatureValide(config.token, url, params, req.headers.get('x-twilio-signature'))) {
    return new Response('Signature invalide.', { status: 403 });
  }

  const whatsapp = (params.From ?? '').startsWith('whatsapp:');
  const numero = (params.From ?? '').replace(/^whatsapp:/, '');
  const texte = (params.Body ?? '').slice(0, 1000);
  const i = await une<{ id: string; prenoms: string }>(
    'SELECT id, prenoms FROM intervenant WHERE telephone = $1 OR whatsapp = $1 ORDER BY (telephone = $1) DESC LIMIT 1',
    [numero],
  );
  if (!i) return reponseTwiml();

  // la proposition la plus recente qui attend une reponse
  const p = await une<{ id: string; mission_id: string; titre: string }>(
    `SELECT a.id, a.mission_id, m.titre FROM affectation a JOIN mission m ON m.id = a.mission_id
      WHERE a.intervenant_id = $1 AND a.reponse = 'en_attente' AND a.proposee_le IS NOT NULL
        AND m.statut IN ('selection', 'preparation', 'execution')
      ORDER BY a.proposee_le DESC LIMIT 1`,
    [i.id],
  );
  await requete(
    `INSERT INTO communication (intervenant_id, mission_id, canal, objet, contenu, statut, modele, sens, mode, numero, fournisseur_ref)
     VALUES ($1, $2, $3, 'Message reçu', $4, 'recu', 'echange', 'entrant', 'automatique', $5, $6)`,
    [i.id, p?.mission_id ?? null, whatsapp ? 'whatsapp' : 'sms', texte, numero, params.MessageSid ?? null],
  );

  const prenom = i.prenoms.trim().split(/\s+/)[0];
  const reponse = lireReponseSms(texte);
  if (!p) return reponseTwiml(reponse ? `Merci ${prenom}. Aucune proposition n’attend votre réponse : votre message est transmis à l’équipe PROXIMA.` : undefined);
  if (!reponse) return reponseTwiml(`Merci ${prenom}, votre message est transmis à l’équipe. Pour la mission « ${p.titre} », répondez OUI ou NON.`);

  const r = await enregistrerReponse(p.id, reponse, whatsapp ? 'whatsapp' : 'sms', reponse === 'refuse' ? 'Refus par message' : null);
  if (!r.ok) return reponseTwiml(`Merci ${prenom}. ${r.erreur}`);
  return reponseTwiml(
    reponse === 'accepte'
      ? `Merci ${prenom}, c’est noté : vous êtes retenu(e) pour la mission « ${p.titre} ». L’équipe PROXIMA vous enverra le briefing.`
      : `Merci ${prenom}, c’est noté. La mission « ${p.titre} » sera proposée à quelqu’un d’autre.`,
  );
}
