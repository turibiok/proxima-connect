'use server';

import { redirect } from 'next/navigation';
import { une } from '@/lib/db';
import { verifier } from '@/lib/auth/mot-de-passe';
import { fermerSession, ouvrirSession } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';

export async function seConnecter(_: string | null, f: FormData): Promise<string | null> {
  const email = String(f.get('email') ?? '').trim().toLowerCase();
  const mdp = String(f.get('mot_de_passe') ?? '');
  const u = await une<{ id: string; mot_de_passe: string; sel: string; actif: boolean }>(
    'SELECT id, mot_de_passe, sel, actif FROM utilisateur WHERE email = $1',
    [email],
  );
  // Meme message que le compte existe ou non : ne pas confirmer qu'une
  // adresse est inscrite.
  if (!u || !u.actif || !verifier(mdp, u.mot_de_passe, u.sel)) {
    await consigner({ utilisateurId: u?.id ?? null, action: 'connexion_echec', entite: 'utilisateur', details: { email } });
    return 'Adresse ou mot de passe incorrect.';
  }
  await ouvrirSession(u.id);
  await consigner({ utilisateurId: u.id, action: 'connexion', entite: 'utilisateur', entiteId: u.id });
  redirect('/');
}

export async function seDeconnecter() {
  await fermerSession();
  redirect('/connexion');
}
