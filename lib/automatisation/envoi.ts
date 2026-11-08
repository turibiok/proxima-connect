import 'server-only';
import { headers } from 'next/headers';
import { requete, une } from '@/lib/db';
import { MODELES, versSms, type Modele } from '@/lib/communication/regles';
import { masquerLien } from '@/lib/espace/regles';
import { canalAutomatique, configFournisseur } from './regles';
import { envoyerTwilio } from './twilio';

/**
 * Envoi automatique d'un message a un intervenant (phase 3), par le
 * fournisseur configure. Chaque envoi est trace, reussi ou non : un echec
 * apparait dans l'historique de l'intervenant et de la mission.
 */
export async function envoyerAutomatique(m: {
  intervenantId: string;
  missionId?: string | null;
  paiementId?: string | null;
  modele: Modele;
  texte: string;
}): Promise<{ ok: boolean; erreur?: string }> {
  const config = configFournisseur(process.env);
  const i = await une<{ telephone: string; whatsapp: string | null }>('SELECT telephone, whatsapp FROM intervenant WHERE id = $1', [m.intervenantId]);
  if (!i) return { ok: false, erreur: 'Intervenant introuvable.' };

  const canal = canalAutomatique(config);
  const numero = canal === 'whatsapp' ? (i.whatsapp ?? i.telephone) : i.telephone;
  const texte = canal === 'sms' ? versSms(m.texte) : m.texte;

  // sans fournisseur, rien n'est trace comme envoye : l'equipe doit savoir qu'elle a a le faire
  if (config.mode === 'aucun') return { ok: false, erreur: 'Aucun fournisseur d’envoi configuré.' };
  let resultat: { ok: true; ref: string } | { ok: false; erreur: string };
  if (config.mode === 'simulation') resultat = { ok: true, ref: `SIMULATION-${Date.now()}` };
  else if (config.mode === 'erreur') resultat = { ok: false, erreur: config.message };
  else resultat = await envoyerTwilio(config, { canal, de: canal === 'whatsapp' ? config.whatsappFrom! : config.smsFrom, a: numero, texte });

  await requete(
    `INSERT INTO communication (intervenant_id, mission_id, paiement_id, canal, objet, contenu, statut, modele, sens, mode, numero, fournisseur_ref, erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sortant', 'automatique', $9, $10, $11)`,
    [
      m.intervenantId, m.missionId ?? null, m.paiementId ?? null, canal, MODELES[m.modele], masquerLien(texte),
      resultat.ok ? 'envoye' : 'echec', m.modele, numero, resultat.ok ? resultat.ref : null, resultat.ok ? null : resultat.erreur,
    ],
  );
  return resultat.ok ? { ok: true } : { ok: false, erreur: resultat.erreur };
}

/**
 * Adresse publique du site, pour les liens des messages. En tache planifiee
 * il n'y a pas de requete entrante : APP_URL, ou l'adresse fournie par Vercel.
 */
export async function adressePublique(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  try {
    const h = await headers();
    const hote = h.get('x-forwarded-host') ?? h.get('host');
    if (hote) return `${h.get('x-forwarded-proto') ?? (hote.startsWith('localhost') ? 'http' : 'https')}://${hote}`;
  } catch {
    // hors requete (tache planifiee)
  }
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3100';
}
