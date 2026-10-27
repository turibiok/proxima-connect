'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requete, une } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { hacher } from '@/lib/auth/mot-de-passe';
import { ROLES, type Role } from '@/lib/auth/roles';
import { consigner } from '@/lib/journal';

export type EtatCompte = { erreur?: string; cree?: { email: string; motDePasse: string } } | null;

/** Mot de passe provisoire lisible (sans 0/O ni 1/l), a transmettre de vive voix. */
function provisoire(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const s = [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}7Q`;
}

export async function creerCompte(_: EtatCompte, f: FormData): Promise<EtatCompte> {
  const ctx = await exigerAction('compte:gerer');
  const email = String(f.get('email') ?? '').trim().toLowerCase();
  const nom = String(f.get('nom_complet') ?? '').trim();
  const role = String(f.get('role')) as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: 'Adresse e-mail invalide.' };
  if (!nom) return { erreur: 'Le nom est obligatoire.' };
  if (!ROLES[role]) return { erreur: 'Rôle inconnu.' };
  if (await une('SELECT 1 FROM utilisateur WHERE email = $1', [email])) return { erreur: 'Un compte existe déjà avec cette adresse.' };

  const motDePasse = provisoire();
  const { hash, sel } = hacher(motDePasse);
  const u = await une<{ id: string }>(
    'INSERT INTO utilisateur (email, nom_complet, role, mot_de_passe, sel) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [email, nom, role, hash, sel],
  );
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'compte_creation', entite: 'utilisateur', entiteId: u!.id, details: { email, role } });
  revalidatePath('/comptes');
  return { cree: { email, motDePasse } };
}

export async function basculerCompte(id: string, actif: boolean) {
  const ctx = await exigerAction('compte:gerer');
  if (id === ctx.utilisateur.id) throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
  await requete('UPDATE utilisateur SET actif = $2 WHERE id = $1', [id, actif]);
  // un compte desactive perd immediatement ses sessions ouvertes
  if (!actif) await requete('DELETE FROM session WHERE utilisateur_id = $1', [id]);
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'compte_etat', entite: 'utilisateur', entiteId: id, details: { actif } });
  revalidatePath('/comptes');
}
