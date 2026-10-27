'use server';

import { redirect } from 'next/navigation';
import { transaction, une } from '@/lib/db';
import { hacher, robustesse, verifier } from '@/lib/auth/mot-de-passe';
import { contexte, fermerSession, jetonCourant, origine, ouvrirSession } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';

/**
 * Limites contre les essais de mots de passe en serie, comptees sur les
 * echecs deja traces au journal (pas de memoire a part a tenir) :
 *   - par adresse : protege un compte cible ;
 *   - par adresse IP : freine celui qui essaie beaucoup d'adresses.
 * Au Benin, de nombreux utilisateurs partagent une meme IP publique
 * (operateurs mobiles) : la limite par IP est donc large.
 */
const FENETRE = '15 minutes';
const MAX_PAR_COMPTE = 5;
const MAX_PAR_IP = 30;

export async function seConnecter(_: string | null, f: FormData): Promise<string | null> {
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 200);
  const mdp = String(f.get('mot_de_passe') ?? '');
  const { ip } = await origine();

  const essais = await une<{ compte: number; ip: number }>(
    `SELECT count(*) FILTER (WHERE details->>'email' = $1)::int AS compte,
            count(*) FILTER (WHERE ip = $2)::int AS ip
       FROM journal
      WHERE action = 'connexion_echec' AND cree_le > now() - $3::interval`,
    [email, ip, FENETRE],
  );
  if ((essais?.compte ?? 0) >= MAX_PAR_COMPTE || (ip && (essais?.ip ?? 0) >= MAX_PAR_IP)) {
    await consigner({ utilisateurId: null, action: 'connexion_bloquee', entite: 'utilisateur', details: { email } });
    return 'Trop de tentatives. Réessayez dans 15 minutes.';
  }

  const u = await une<{ id: string; mot_de_passe: string; sel: string; actif: boolean; mdp_provisoire: boolean }>(
    'SELECT id, mot_de_passe, sel, actif, mdp_provisoire FROM utilisateur WHERE email = $1',
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
  redirect(u.mdp_provisoire ? '/compte/mot-de-passe' : '/');
}

export async function seDeconnecter() {
  await fermerSession();
  redirect('/connexion');
}

/**
 * Changement de mot de passe. Les autres sessions du compte sont fermees :
 * si l'ancien mot de passe avait fuite, celui qui s'en servait est deconnecte.
 */
export async function changerMotDePasse(_: string | null, f: FormData): Promise<string | null> {
  const ctx = await contexte();
  if (!ctx) redirect('/connexion');
  const ancien = String(f.get('ancien') ?? '');
  const nouveau = String(f.get('nouveau') ?? '');
  const confirmation = String(f.get('confirmation') ?? '');

  const u = await une<{ mot_de_passe: string; sel: string }>('SELECT mot_de_passe, sel FROM utilisateur WHERE id = $1', [ctx.utilisateur.id]);
  if (!u || !verifier(ancien, u.mot_de_passe, u.sel)) return 'Mot de passe actuel incorrect.';
  if (nouveau !== confirmation) return 'Les deux saisies du nouveau mot de passe diffèrent.';
  if (nouveau === ancien) return 'Le nouveau mot de passe doit être différent de l’actuel.';
  const problemes = robustesse(nouveau);
  if (problemes.length) return `Mot de passe trop faible : ${problemes.join(' ')}`;

  const { hash, sel } = hacher(nouveau);
  const courant = await jetonCourant();
  await transaction(async (c) => {
    await c.query(
      'UPDATE utilisateur SET mot_de_passe = $2, sel = $3, mdp_provisoire = false, mdp_change_le = now() WHERE id = $1',
      [ctx.utilisateur.id, hash, sel],
    );
    await c.query('DELETE FROM session WHERE utilisateur_id = $1 AND jeton_hash <> $2', [ctx.utilisateur.id, courant ?? '']);
    await consigner({ utilisateurId: ctx.utilisateur.id, action: 'mot_de_passe', entite: 'utilisateur', entiteId: ctx.utilisateur.id }, c);
  });
  redirect('/');
}
