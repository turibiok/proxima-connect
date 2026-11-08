'use server';

import { revalidatePath } from 'next/cache';
import { requete, une } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { completerEquipe } from './selection';
import { executerTaches, type BilanTaches } from './taches';

export type EtatSelectionAuto = { ok?: string; erreur?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Regle la selection automatique d'une mission et, sur demande, la lance :
 * le programme choisit les profils et leur envoie la proposition.
 */
export async function reglerSelectionAuto(missionId: string, _: EtatSelectionAuto, f: FormData): Promise<EtatSelectionAuto> {
  const ctx = await exigerAction('mission:modifier');
  if (!UUID.test(missionId)) return { erreur: 'Mission introuvable.' };
  const reserve = Number(f.get('reserve_pourcent'));
  const delai = Number(f.get('delai_reponse_heures'));
  if (!Number.isInteger(reserve) || reserve < 0 || reserve > 100) return { erreur: 'Réserve : un pourcentage entier de 0 à 100.' };
  if (!Number.isInteger(delai) || delai < 2 || delai > 168) return { erreur: 'Délai de réponse : de 2 à 168 heures.' };
  const continuer = f.get('selection_auto') === 'on';

  const m = await une<{ reference: string; statut: string }>(
    `UPDATE mission SET selection_auto = $2, reserve_pourcent = $3, delai_reponse_heures = $4, maj_le = now()
      WHERE id = $1 AND statut IN ('selection', 'preparation', 'execution') RETURNING reference, statut`,
    [missionId, continuer, reserve, delai],
  );
  if (!m) return { erreur: 'La mission n’est plus en recrutement.' };
  await consigner({
    utilisateurId: ctx.utilisateur.id, action: 'selection_auto_reglage', entite: 'mission', entiteId: missionId,
    details: { reference: m.reference, selection_auto: continuer, reserve, delai },
  });

  let message = continuer ? 'Sélection automatique activée.' : 'Réglages enregistrés.';
  if (f.get('lancer') === '1') {
    const r = await completerEquipe(missionId, ctx.utilisateur.id);
    message = r.titulaires + r.remplacants
      ? `${r.titulaires} titulaire${r.titulaires > 1 ? 's' : ''} et ${r.remplacants} remplaçant${r.remplacants > 1 ? 's' : ''} ${r.envoye ? 'sollicité' : 'ajouté'}${r.titulaires + r.remplacants > 1 ? 's' : ''}.${r.raison ? ` ${r.raison}` : ''}`
      : (r.raison ?? 'Rien à faire.');
  }
  revalidatePath(`/missions/${missionId}`);
  revalidatePath(`/missions/${missionId}/selection`);
  return { ok: message };
}

/** Lancement manuel des taches automatiques (administrateur). */
export async function lancerTaches(_: { bilan?: BilanTaches; erreur?: string } | null): Promise<{ bilan?: BilanTaches; erreur?: string }> {
  const ctx = await exigerAction('parametre:gerer');
  try {
    const bilan = await executerTaches('manuel', ctx.utilisateur.id);
    revalidatePath('/parametres/automatisation');
    return { bilan };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inattendue.' };
  }
}

/** Dernieres executions, pour la page Parametres. */
export async function dernieresExecutions() {
  await exigerAction('parametre:gerer');
  return requete<{ id: number; lancee_le: Date; declencheur: string; duree_ms: number | null; resultat: Record<string, number | string> | null; erreur: string | null }>(
    'SELECT id, lancee_le, declencheur, duree_ms, resultat, erreur FROM tache_execution ORDER BY lancee_le DESC LIMIT 15',
  );
}
