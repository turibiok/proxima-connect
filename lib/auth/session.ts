import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requete, une } from '@/lib/db';
import { peut, type Droit, type Role } from './roles';

export const COOKIE_SESSION = 'px_session';
const DUREE_HEURES = 12;

export interface Utilisateur {
  id: string;
  email: string;
  nom_complet: string;
  role: Role;
}

export interface Contexte {
  utilisateur: Utilisateur;
  peut: (d: Droit) => boolean;
}

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');

/**
 * Contexte de la requete courante, ou null sans session valide.
 * `cache` : le layout et la page le demandent tous deux, une seule requete SQL.
 */
export const contexte = cache(async (): Promise<Contexte | null> => {
  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  if (!jeton) return null;
  const u = await une<Utilisateur>(
    `SELECT u.id, u.email, u.nom_complet, u.role
       FROM session s JOIN utilisateur u ON u.id = s.utilisateur_id
      WHERE s.jeton_hash = $1 AND s.expire_le > now() AND u.actif`,
    [empreinte(jeton)],
  );
  if (!u) return null;
  return { utilisateur: u, peut: (d) => peut(u.role, d) };
});

export async function ouvrirSession(utilisateurId: string) {
  const jeton = randomBytes(32).toString('base64url');
  const { ip, userAgent } = await origine();
  await requete(
    `INSERT INTO session (utilisateur_id, jeton_hash, expire_le, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [utilisateurId, empreinte(jeton), DUREE_HEURES, ip, userAgent],
  );
  await requete('UPDATE utilisateur SET derniere_connexion = now() WHERE id = $1', [utilisateurId]);
  (await cookies()).set(COOKIE_SESSION, jeton, {
    httpOnly: true, // illisible par le JavaScript de la page
    sameSite: 'lax', // pas envoye depuis un site tiers
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DUREE_HEURES * 3600,
  });
}

export async function fermerSession() {
  const jar = await cookies();
  const jeton = jar.get(COOKIE_SESSION)?.value;
  if (jeton) await requete('DELETE FROM session WHERE jeton_hash = $1', [empreinte(jeton)]);
  jar.delete(COOKIE_SESSION);
}

export async function origine(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  return {
    ip: fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip'),
    userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
  };
}

// ------------------------------------------------------------ gardes

/** Pour une page : redirige vers la connexion ou vers l'acces refuse. */
export async function exiger(droit?: Droit): Promise<Contexte> {
  const ctx = await contexte();
  if (!ctx) redirect('/connexion');
  if (droit && !ctx.peut(droit)) redirect('/acces-refuse');
  return ctx;
}

/** Pour une action serveur : leve une erreur au lieu de rediriger. */
export async function exigerAction(droit: Droit): Promise<Contexte> {
  const ctx = await contexte();
  if (!ctx) throw new Error('Session expirée : reconnectez-vous.');
  if (!ctx.peut(droit)) throw new Error('Vous n’avez pas le droit de faire cette action.');
  return ctx;
}
