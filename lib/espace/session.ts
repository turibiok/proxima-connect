import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PoolClient } from 'pg';
import { requete, une } from '@/lib/db';
import { origine } from '@/lib/auth/session';
import { accesAutorise, DUREE_LIEN_JOURS, DUREE_SESSION_JOURS } from './regles';

/**
 * Sessions de l'espace intervenant. Volontairement separees de celles de
 * l'equipe (autre table, autre cookie limite a /espace) : une session
 * d'intervenant ne donne aucun acces au back-office, et inversement.
 */

export const COOKIE_ESPACE = 'px_espace';

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');
const nouveauJeton = () => randomBytes(32).toString('base64url');

export interface IntervenantConnecte {
  id: string;
  nom: string;
  prenoms: string;
  reference: string;
  statut: string;
}

/** Adresse du site, pour composer le lien envoye (derriere le proxy de l'hebergeur). */
async function adresseSite(): Promise<string> {
  const h = await headers();
  const hote = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (hote.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${hote}`;
}

/**
 * Cree un lien d'acces pour un intervenant. Les liens precedents encore
 * valables sont revoques : il n'en existe qu'un a la fois.
 */
export async function creerLien(c: PoolClient, intervenantId: string, utilisateurId: string): Promise<string> {
  const jeton = nouveauJeton();
  await c.query(
    `UPDATE acces_intervenant SET revoque_le = now() WHERE intervenant_id = $1 AND utilise_le IS NULL AND revoque_le IS NULL`,
    [intervenantId],
  );
  await c.query(
    `INSERT INTO acces_intervenant (intervenant_id, jeton_hash, cree_par, expire_le)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [intervenantId, empreinte(jeton), utilisateurId, DUREE_LIEN_JOURS],
  );
  return `${await adresseSite()}/espace/acces/${jeton}`;
}

/** Lien designe par un jeton recu dans l'adresse (verrouille pour la verification). */
export async function lireLien(c: PoolClient, jeton: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(jeton)) return null;
  const { rows } = await c.query(
    `SELECT a.id, a.intervenant_id, a.expire_le, a.utilise_le, a.revoque_le, a.echecs,
            i.date_naissance, i.statut, i.nom, i.prenoms
       FROM acces_intervenant a JOIN intervenant i ON i.id = a.intervenant_id
      WHERE a.jeton_hash = $1 FOR UPDATE OF a`,
    [empreinte(jeton)],
  );
  return rows[0] ?? null;
}

/** Lecture sans verrou, pour l'affichage de la page d'ouverture. */
export async function apercuLien(jeton: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(jeton)) return undefined;
  return une<{ expire_le: Date; utilise_le: Date | null; revoque_le: Date | null; echecs: number; prenoms: string; statut: string }>(
    `SELECT a.expire_le, a.utilise_le, a.revoque_le, a.echecs, i.prenoms, i.statut
       FROM acces_intervenant a JOIN intervenant i ON i.id = a.intervenant_id WHERE a.jeton_hash = $1`,
    [empreinte(jeton)],
  );
}

export async function ouvrirSessionIntervenant(c: PoolClient, intervenantId: string) {
  const jeton = nouveauJeton();
  const { ip, userAgent } = await origine();
  await c.query('DELETE FROM session_intervenant WHERE intervenant_id = $1 AND expire_le < now()', [intervenantId]);
  await c.query(
    `INSERT INTO session_intervenant (intervenant_id, jeton_hash, expire_le, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [intervenantId, empreinte(jeton), DUREE_SESSION_JOURS, ip, userAgent],
  );
  (await cookies()).set(COOKIE_ESPACE, jeton, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/espace',
    maxAge: DUREE_SESSION_JOURS * 86_400,
  });
}

/** Intervenant connecte a l'espace, ou null. Un profil devenu inactif perd l'acces aussitot. */
export const intervenantCourant = cache(async (): Promise<IntervenantConnecte | null> => {
  const jeton = (await cookies()).get(COOKIE_ESPACE)?.value;
  if (!jeton) return null;
  const i = await une<IntervenantConnecte & { session_id: string }>(
    `SELECT i.id, i.nom, i.prenoms, i.reference, i.statut, s.id AS session_id
       FROM session_intervenant s JOIN intervenant i ON i.id = s.intervenant_id
      WHERE s.jeton_hash = $1 AND s.expire_le > now()`,
    [empreinte(jeton)],
  );
  if (!i || !accesAutorise(i.statut)) return null;
  await requete('UPDATE session_intervenant SET derniere_visite = now() WHERE id = $1', [i.session_id]);
  return { id: i.id, nom: i.nom, prenoms: i.prenoms, reference: i.reference, statut: i.statut };
});

/** Pour une page de l'espace : sans session, page d'explication. */
export async function exigerIntervenant(): Promise<IntervenantConnecte> {
  const i = await intervenantCourant();
  if (!i) redirect('/espace/connexion');
  return i;
}

export async function fermerSessionIntervenant() {
  const jar = await cookies();
  const jeton = jar.get(COOKIE_ESPACE)?.value;
  if (jeton) await requete('DELETE FROM session_intervenant WHERE jeton_hash = $1', [empreinte(jeton)]);
  jar.delete({ name: COOKIE_ESPACE, path: '/espace' });
}
