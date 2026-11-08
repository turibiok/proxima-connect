'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requete, transaction, une } from '@/lib/db';
import { exigerAction, origine } from '@/lib/auth/session';
import { hacher, motDePasseProvisoire, robustesse, verifier } from '@/lib/auth/mot-de-passe';
import { consigner } from '@/lib/journal';
import { lireSatisfaction } from '@/lib/reporting/regles';
import { compteCourant, exigerClient, fermerSessionClient, jetonClientCourant, ouvrirSessionClient } from './session';

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------ cote client

/** Connexion d'un client. Memes limites d'essais que pour l'equipe (journal). */
export async function connexionClient(_: string | null, f: FormData): Promise<string | null> {
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 200);
  const mdp = String(f.get('mot_de_passe') ?? '');
  const { ip } = await origine();
  const essais = await une<{ compte: number; ip: number }>(
    `SELECT count(*) FILTER (WHERE details->>'email' = $1)::int AS compte, count(*) FILTER (WHERE ip = $2)::int AS ip
       FROM journal WHERE action = 'client_connexion_echec' AND cree_le > now() - interval '15 minutes'`,
    [email, ip],
  );
  if ((essais?.compte ?? 0) >= 5 || (ip && (essais?.ip ?? 0) >= 30)) return 'Trop de tentatives. Réessayez dans 15 minutes.';

  const k = await une<{ id: string; client_id: string; mot_de_passe: string; sel: string; actif: boolean; mdp_provisoire: boolean }>(
    'SELECT id, client_id, mot_de_passe, sel, actif, mdp_provisoire FROM compte_client WHERE email = $1',
    [email],
  );
  if (!k || !k.actif || !verifier(mdp, k.mot_de_passe, k.sel)) {
    await consigner({ utilisateurId: null, action: 'client_connexion_echec', entite: 'compte_client', entiteId: k?.id ?? null, details: { email } });
    return 'Adresse ou mot de passe incorrect.';
  }
  await ouvrirSessionClient(k.id);
  await consigner({ utilisateurId: null, action: 'client_connexion', entite: 'client', entiteId: k.client_id, details: { email } });
  redirect(k.mdp_provisoire ? '/client/mot-de-passe' : '/client');
}

export async function changerMotDePasseClient(_: string | null, f: FormData): Promise<string | null> {
  const k = await compteCourant();
  if (!k) redirect('/client/connexion');
  const ancien = String(f.get('ancien') ?? '');
  const nouveau = String(f.get('nouveau') ?? '');
  if (nouveau !== String(f.get('confirmation') ?? '')) return 'Les deux saisies du nouveau mot de passe diffèrent.';
  if (nouveau === ancien) return 'Le nouveau mot de passe doit être différent de l’actuel.';
  const problemes = robustesse(nouveau);
  if (problemes.length) return `Mot de passe trop faible : ${problemes.join(' ')}`;
  const actuel = await une<{ mot_de_passe: string; sel: string }>('SELECT mot_de_passe, sel FROM compte_client WHERE id = $1', [k.id]);
  if (!actuel || !verifier(ancien, actuel.mot_de_passe, actuel.sel)) return 'Mot de passe actuel incorrect.';
  const { hash, sel } = hacher(nouveau);
  const courant = await jetonClientCourant();
  await transaction(async (c) => {
    await c.query('UPDATE compte_client SET mot_de_passe = $2, sel = $3, mdp_provisoire = false WHERE id = $1', [k.id, hash, sel]);
    // les autres sessions du compte sont fermees
    await c.query('DELETE FROM session_client WHERE compte_id = $1 AND jeton_hash <> $2', [k.id, courant ?? '']);
    await consigner({ utilisateurId: null, action: 'client_mot_de_passe', entite: 'client', entiteId: k.client_id, details: { email: k.email } }, c);
  });
  redirect('/client');
}

export async function deconnexionClient() {
  await fermerSessionClient();
  redirect('/client/connexion');
}

/** Le client donne lui-meme son avis sur une mission dont il a recu le rapport. */
export async function donnerAvis(missionId: string, _: { ok?: string; erreurs?: Record<string, string> } | null, f: FormData) {
  const k = await exigerClient();
  if (!UUID.test(missionId)) return { erreurs: { general: 'Mission introuvable.' } };
  const r = lireSatisfaction(f);
  if (!r.ok) return { erreurs: r.erreurs };
  const m = await une<{ reference: string }>(
    `UPDATE mission SET satisfaction_note = $3, satisfaction_commentaire = $4, satisfaction_le = now(), satisfaction_par = NULL,
            satisfaction_source = 'client', satisfaction_compte = $5, maj_le = now()
      WHERE id = $1 AND client_id = $2 AND rapport_transmis_le IS NOT NULL RETURNING reference`,
    [missionId, k.client_id, r.donnees.note, r.donnees.commentaire, k.id],
  );
  if (!m) return { erreurs: { general: 'L’avis se donne une fois le rapport reçu.' } };
  for (const [entite, entiteId] of [['mission', missionId], ['client', k.client_id]]) {
    await consigner({ utilisateurId: null, action: 'satisfaction_client', entite, entiteId, details: { reference: m.reference, note: r.donnees.note, par: k.email } });
  }
  revalidatePath(`/client/missions/${missionId}`);
  revalidatePath(`/missions/${missionId}/rapport`);
  return { ok: 'Merci : votre avis est transmis à l’équipe PROXIMA.' };
}

// ------------------------------------------------------------ cote equipe

export type EtatCompteClient = { erreur?: string; cree?: { email: string; motDePasse: string } } | null;

/** Cree un acces a l'espace client ; le mot de passe provisoire n'est affiche qu'une fois. */
export async function creerCompteClient(clientId: string, _: EtatCompteClient, f: FormData): Promise<EtatCompteClient> {
  const ctx = await exigerAction('client:modifier');
  if (!UUID.test(clientId)) return { erreur: 'Client introuvable.' };
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 200);
  const nom = String(f.get('nom_complet') ?? '').trim().slice(0, 120);
  if (!EMAIL.test(email)) return { erreur: 'Adresse e-mail invalide.' };
  if (nom.length < 2) return { erreur: 'Indiquez le nom de la personne.' };
  const motDePasse = motDePasseProvisoire();
  const { hash, sel } = hacher(motDePasse);
  try {
    await transaction(async (c) => {
      await c.query(
        'INSERT INTO compte_client (client_id, email, nom_complet, mot_de_passe, sel, cree_par) VALUES ($1, $2, $3, $4, $5, $6)',
        [clientId, email, nom, hash, sel, ctx.utilisateur.id],
      );
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'client_compte_creation', entite: 'client', entiteId: clientId, details: { email } }, c);
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { erreur: 'Cette adresse a déjà un accès.' };
    throw e;
  }
  revalidatePath(`/clients/${clientId}`);
  return { cree: { email, motDePasse } };
}

export async function reinitialiserCompteClient(compteId: string): Promise<{ email: string; motDePasse: string } | { erreur: string }> {
  const ctx = await exigerAction('client:modifier');
  if (!UUID.test(compteId)) return { erreur: 'Compte introuvable.' };
  const motDePasse = motDePasseProvisoire();
  const { hash, sel } = hacher(motDePasse);
  const k = await transaction(async (c) => {
    const { rows } = await c.query<{ email: string; client_id: string }>(
      'UPDATE compte_client SET mot_de_passe = $2, sel = $3, mdp_provisoire = true WHERE id = $1 RETURNING email, client_id',
      [compteId, hash, sel],
    );
    if (!rows[0]) return null;
    await c.query('DELETE FROM session_client WHERE compte_id = $1', [compteId]);
    await consigner({ utilisateurId: ctx.utilisateur.id, action: 'client_compte_reinitialisation', entite: 'client', entiteId: rows[0].client_id, details: { email: rows[0].email } }, c);
    return rows[0];
  });
  if (!k) return { erreur: 'Compte introuvable.' };
  revalidatePath(`/clients/${k.client_id}`);
  return { email: k.email, motDePasse };
}

export async function basculerCompteClient(compteId: string, actif: boolean) {
  const ctx = await exigerAction('client:modifier');
  if (!UUID.test(compteId)) return;
  const k = await une<{ email: string; client_id: string }>('UPDATE compte_client SET actif = $2 WHERE id = $1 RETURNING email, client_id', [compteId, actif]);
  if (!k) return;
  if (!actif) await requete('DELETE FROM session_client WHERE compte_id = $1', [compteId]);
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'client_compte_etat', entite: 'client', entiteId: k.client_id, details: { email: k.email, actif } });
  revalidatePath(`/clients/${k.client_id}`);
}
