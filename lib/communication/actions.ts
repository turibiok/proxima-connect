'use server';

import { revalidatePath } from 'next/cache';
import { une, requete } from '@/lib/db';
import { exigerAction, type Contexte } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { lireEchange, lireMessage, MODELES, versSms } from './regles';
import { masquerLien } from '@/lib/espace/regles';

export type EtatEnvoi = { erreurs?: Record<string, string>; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/** Qui peut ecrire a un intervenant, selon ce dont parle le message. */
function autorise(ctx: Contexte, modele: string): boolean {
  if (modele === 'paiement') return ctx.peut('paiement:gerer');
  if (modele === 'rappel') return ctx.peut('mission:modifier');
  return ctx.peut('mission:modifier') || ctx.peut('profil:modifier');
}

function rafraichir(intervenantId: string, missionId: string | null) {
  revalidatePath(`/intervenants/${intervenantId}`);
  if (missionId) revalidatePath(`/missions/${missionId}`);
  revalidatePath('/finances/paiements');
  revalidatePath('/');
}

/**
 * Trace un message envoye depuis le telephone de l'equipe (WhatsApp ou
 * SMS) : le texte exact, le numero, la mission ou le paiement concerne.
 * Appele au moment ou l'on ouvre l'application d'envoi.
 *
 * Point de branchement d'un fournisseur (phase 3) : c'est ici qu'un envoi
 * automatique remplacerait l'ouverture du telephone (mode « automatique »).
 */
export async function enregistrerEnvoi(
  cible: { intervenantId: string; missionId?: string | null; paiementId?: string | null },
  _: EtatEnvoi,
  f: FormData,
): Promise<EtatEnvoi> {
  const ctx = await exigerAction('profil:lire');
  const r = lireMessage(f);
  if (!r.ok) return { erreurs: r.erreurs };
  if (!autorise(ctx, r.donnees.modele)) return { erreurs: { general: 'Vous n’avez pas le droit d’envoyer ce message.' } };
  if (!UUID.test(cible.intervenantId) || (cible.missionId && !UUID.test(cible.missionId)) || (cible.paiementId && !UUID.test(cible.paiementId))) {
    return { erreurs: { general: 'Destinataire introuvable.' } };
  }

  const i = await une<{ nom: string; prenoms: string; telephone: string; whatsapp: string | null }>(
    'SELECT nom, prenoms, telephone, whatsapp FROM intervenant WHERE id = $1',
    [cible.intervenantId],
  );
  if (!i) return { erreurs: { general: 'Intervenant introuvable.' } };
  // le paiement et la mission doivent bien concerner cet intervenant
  let missionId = cible.missionId ?? null;
  if (cible.paiementId) {
    const p = await une<{ mission_id: string }>('SELECT mission_id FROM paiement_intervenant WHERE id = $1 AND intervenant_id = $2', [cible.paiementId, cible.intervenantId]);
    if (!p) return { erreurs: { general: 'Paiement introuvable pour cet intervenant.' } };
    missionId = p.mission_id;
  } else if (missionId) {
    const a = await une('SELECT 1 FROM affectation WHERE mission_id = $1 AND intervenant_id = $2', [missionId, cible.intervenantId]);
    if (!a) return { erreurs: { general: 'Cet intervenant ne fait pas partie de la mission.' } };
  }

  const numero = r.donnees.canal === 'whatsapp' ? (i.whatsapp ?? i.telephone) : i.telephone;
  // le jeton d'un lien d'acces n'est jamais conserve en clair, meme dans l'historique
  const contenu = masquerLien(r.donnees.canal === 'sms' ? versSms(r.donnees.contenu) : r.donnees.contenu);
  await requete(
    `INSERT INTO communication (intervenant_id, mission_id, paiement_id, canal, objet, contenu, statut, modele, sens, mode, numero, auteur_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'envoye', $7, 'sortant', 'manuel', $8, $9)`,
    [cible.intervenantId, missionId, cible.paiementId ?? null, r.donnees.canal, MODELES[r.donnees.modele], contenu, r.donnees.modele, numero, ctx.utilisateur.id],
  );
  await consigner({
    utilisateurId: ctx.utilisateur.id, action: 'communication_envoi', entite: 'intervenant', entiteId: cible.intervenantId,
    details: { modele: r.donnees.modele, canal: r.donnees.canal, mission: missionId ?? undefined },
  });
  rafraichir(cible.intervenantId, missionId);
  return { ok: `${MODELES[r.donnees.modele]} : envoi consigné.` };
}

/** Consigne un echange qui ne passe pas par le programme : appel, message recu, e-mail. */
export async function consignerEchange(intervenantId: string, _: EtatEnvoi, f: FormData): Promise<EtatEnvoi> {
  const ctx = await exigerAction('profil:lire');
  if (!ctx.peut('mission:modifier') && !ctx.peut('profil:modifier')) return { erreurs: { general: 'Vous n’avez pas le droit de faire cette action.' } };
  if (!UUID.test(intervenantId)) return { erreurs: { general: 'Intervenant introuvable.' } };
  const r = lireEchange(f);
  if (!r.ok) return { erreurs: r.erreurs };
  const missionSaisie = String(f.get('mission_id') ?? '');
  const missionId = UUID.test(missionSaisie) ? missionSaisie : null;
  if (missionId && !(await une('SELECT 1 FROM affectation WHERE mission_id = $1 AND intervenant_id = $2', [missionId, intervenantId]))) {
    return { erreurs: { general: 'Cet intervenant ne fait pas partie de cette mission.' } };
  }
  const existe = await une('SELECT 1 FROM intervenant WHERE id = $1', [intervenantId]);
  if (!existe) return { erreurs: { general: 'Intervenant introuvable.' } };

  await requete(
    `INSERT INTO communication (intervenant_id, mission_id, canal, objet, contenu, statut, modele, sens, mode, auteur_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'echange', $7, 'manuel', $8)`,
    [intervenantId, missionId, r.donnees.canal, MODELES.echange, r.donnees.contenu, r.donnees.sens === 'entrant' ? 'recu' : 'envoye', r.donnees.sens, ctx.utilisateur.id],
  );
  await consigner({
    utilisateurId: ctx.utilisateur.id, action: 'communication_echange', entite: 'intervenant', entiteId: intervenantId,
    details: { canal: r.donnees.canal, sens: r.donnees.sens, mission: missionId ?? undefined },
  });
  rafraichir(intervenantId, missionId);
  return { ok: 'Échange consigné.' };
}
