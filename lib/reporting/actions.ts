'use server';

import { revalidatePath } from 'next/cache';
import { transaction } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { lireIndicateurs, lireSatisfaction, lireTransmission } from './regles';

export type EtatRapport = { erreurs?: Record<string, string>; valeurs?: Record<string, string>; ok?: string } | null;

/** Etapes ou le rapport se prepare : une fois le travail fait. */
const STATUTS_RAPPORT = ['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'];

function valeurs(f: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, x] of f.entries()) if (typeof x === 'string' && !k.startsWith('$')) v[k] = x;
  return v;
}

const erreur = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue.');

function rafraichir(id: string) {
  revalidatePath(`/missions/${id}/rapport`);
  revalidatePath(`/missions/${id}`);
  revalidatePath('/missions');
  revalidatePath('/reporting');
  revalidatePath('/');
}

/** Synthese et indicateurs convenus : remplaces d'un bloc a chaque enregistrement. */
export async function enregistrerRapport(missionId: string, _: EtatRapport, f: FormData): Promise<EtatRapport> {
  const ctx = await exigerAction('mission:modifier');
  const r = lireIndicateurs(f);
  if (!r.ok) return { erreurs: r.erreurs };
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT reference, statut, rapport_transmis_le FROM mission WHERE id = $1 FOR UPDATE', [missionId]);
      const m = rows[0];
      if (!m) throw new Error('Mission introuvable.');
      if (!STATUTS_RAPPORT.includes(m.statut)) throw new Error('Le rapport se prépare une fois les preuves collectées.');
      await c.query('UPDATE mission SET rapport_synthese = $2, maj_le = now() WHERE id = $1', [missionId, r.donnees.synthese]);
      await c.query('DELETE FROM mission_indicateur WHERE mission_id = $1', [missionId]);
      for (const [i, ind] of r.donnees.indicateurs.entries()) {
        await c.query(
          'INSERT INTO mission_indicateur (mission_id, libelle, cible, resultat, ordre) VALUES ($1, $2, $3, $4, $5)',
          [missionId, ind.libelle, ind.cible, ind.resultat, i],
        );
      }
      await consigner(
        {
          utilisateurId: ctx.utilisateur.id, action: 'rapport_preparation', entite: 'mission', entiteId: missionId,
          // un rapport modifie apres sa transmission doit se voir : le client a une autre version
          details: { reference: m.reference, indicateurs: r.donnees.indicateurs.length, apres_transmission: m.rapport_transmis_le ? true : undefined },
        },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) } };
  }
  rafraichir(missionId);
  return { ok: 'Rapport enregistré.' };
}

/**
 * Enregistre la transmission du rapport au client. Depuis l'etape
 * « controlee », la mission passe dans la foulee a « rapport transmis ».
 */
export async function transmettreRapport(missionId: string, _: EtatRapport, f: FormData): Promise<EtatRapport> {
  const ctx = await exigerAction('mission:modifier');
  const r = lireTransmission(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  let avance = false;
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT reference, statut FROM mission WHERE id = $1 FOR UPDATE', [missionId]);
      const m = rows[0];
      if (!m) throw new Error('Mission introuvable.');
      if (!['controlee', 'rapport_transmis', 'payee'].includes(m.statut)) {
        throw new Error('Le rapport se transmet une fois la mission contrôlée : les données doivent être validées avant d’être remises au client.');
      }
      avance = m.statut === 'controlee';
      await c.query(
        `UPDATE mission SET rapport_transmis_le = $2, rapport_canal = $3, rapport_destinataire = $4, rapport_transmis_par = $5,
                rapport_genere_le = coalesce(rapport_genere_le, now()), maj_le = now(),
                statut = CASE WHEN statut = 'controlee' THEN 'rapport_transmis' ELSE statut END,
                statut_change_le = CASE WHEN statut = 'controlee' THEN now() ELSE statut_change_le END
          WHERE id = $1`,
        [missionId, r.donnees.le, r.donnees.canal, r.donnees.destinataire, ctx.utilisateur.id],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'rapport_transmission', entite: 'mission', entiteId: missionId, details: { reference: m.reference, canal: r.donnees.canal, destinataire: r.donnees.destinataire } },
        c,
      );
      if (avance) {
        await consigner(
          { utilisateurId: ctx.utilisateur.id, action: 'mission_statut', entite: 'mission', entiteId: missionId, details: { reference: m.reference, de: 'controlee', vers: 'rapport_transmis' } },
          c,
        );
      }
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichir(missionId);
  return { ok: avance ? 'Transmission enregistrée : la mission passe à « Rapport transmis ».' : 'Transmission enregistrée.' };
}

/** Retour du client sur la mission, recueilli par l'equipe mission ou commerciale. */
export async function enregistrerSatisfaction(missionId: string, _: EtatRapport, f: FormData): Promise<EtatRapport> {
  const ctx = await exigerAction('mission:lire');
  if (!ctx.peut('mission:modifier') && !ctx.peut('client:modifier')) return { erreurs: { general: 'Vous n’avez pas le droit de faire cette action.' } };
  const r = lireSatisfaction(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT reference, client_id, rapport_transmis_le, satisfaction_note FROM mission WHERE id = $1 FOR UPDATE', [missionId]);
      const m = rows[0];
      if (!m) throw new Error('Mission introuvable.');
      if (!m.rapport_transmis_le) throw new Error('Le client donne son avis après avoir reçu le rapport.');
      await c.query(
        `UPDATE mission SET satisfaction_note = $2, satisfaction_commentaire = $3, satisfaction_le = now(), satisfaction_par = $4,
                satisfaction_source = 'equipe', satisfaction_compte = NULL, maj_le = now() WHERE id = $1`,
        [missionId, r.donnees.note, r.donnees.commentaire, ctx.utilisateur.id],
      );
      // trace sur la mission et sur la fiche du client
      for (const [entite, entiteId] of [['mission', missionId], ['client', m.client_id]]) {
        await consigner(
          {
            utilisateurId: ctx.utilisateur.id, action: 'satisfaction_client', entite, entiteId,
            details: { reference: m.reference, note: r.donnees.note, ancienne_note: m.satisfaction_note ?? undefined },
          },
          c,
        );
      }
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichir(missionId);
  return { ok: 'Avis du client enregistré.' };
}
