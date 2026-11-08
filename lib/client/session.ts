import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requete, une } from '@/lib/db';
import { origine } from '@/lib/auth/session';

/**
 * Sessions de l'espace client (phase 4). Separees de celles de l'equipe et
 * des intervenants : autre table, cookie limite a /client. Un compte client
 * ne voit que les missions, rapports et factures de son entreprise.
 */

export const COOKIE_CLIENT = 'px_client';
const DUREE_JOURS = 30;

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');

export interface CompteConnecte {
  id: string;
  client_id: string;
  email: string;
  nom_complet: string;
  raison_sociale: string;
  mdp_provisoire: boolean;
}

export async function ouvrirSessionClient(compteId: string) {
  const jeton = randomBytes(32).toString('base64url');
  const { ip, userAgent } = await origine();
  await requete('DELETE FROM session_client WHERE compte_id = $1 AND expire_le < now()', [compteId]);
  await requete(
    `INSERT INTO session_client (compte_id, jeton_hash, expire_le, ip, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [compteId, empreinte(jeton), DUREE_JOURS, ip, userAgent],
  );
  await requete('UPDATE compte_client SET derniere_connexion = now() WHERE id = $1', [compteId]);
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(COOKIE_CLIENT, jeton, { httpOnly: true, sameSite: 'lax', secure, path: '/client', maxAge: DUREE_JOURS * 86_400 });
  // repere d'aiguillage de l'application installee (/demarrage), sans valeur d'acces
  jar.set('px_profil', 'client', { path: '/', sameSite: 'lax', secure, maxAge: DUREE_JOURS * 86_400 });
}

/** Empreinte de la session courante, pour fermer les autres apres un changement de mot de passe. */
export async function jetonClientCourant(): Promise<string | null> {
  const jeton = (await cookies()).get(COOKIE_CLIENT)?.value;
  return jeton ? empreinte(jeton) : null;
}

/** Compte client connecte, ou null. Un compte desactive perd l'acces aussitot. */
export const compteCourant = cache(async (): Promise<CompteConnecte | null> => {
  const jeton = (await cookies()).get(COOKIE_CLIENT)?.value;
  if (!jeton) return null;
  return (
    (await une<CompteConnecte>(
      `SELECT k.id, k.client_id, k.email, k.nom_complet, c.raison_sociale, k.mdp_provisoire
         FROM session_client s JOIN compte_client k ON k.id = s.compte_id JOIN client c ON c.id = k.client_id
        WHERE s.jeton_hash = $1 AND s.expire_le > now() AND k.actif`,
      [empreinte(jeton)],
    )) ?? null
  );
});

/** Pour une page de l'espace client. */
export async function exigerClient(): Promise<CompteConnecte> {
  const k = await compteCourant();
  if (!k) redirect('/client/connexion');
  if (k.mdp_provisoire) redirect('/client/mot-de-passe');
  return k;
}

export async function fermerSessionClient() {
  const jar = await cookies();
  const jeton = jar.get(COOKIE_CLIENT)?.value;
  if (jeton) await requete('DELETE FROM session_client WHERE jeton_hash = $1', [empreinte(jeton)]);
  jar.delete({ name: COOKIE_CLIENT, path: '/client' });
}
