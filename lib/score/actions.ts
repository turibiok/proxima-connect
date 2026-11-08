'use server';

import { revalidatePath } from 'next/cache';
import { transaction } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { recalculerScore } from './calcul';
import { CRITERES_NOTES, ISSUES, lireEvaluation, peutTrancher, type CodeCritere, type Issue } from './regles';

export type EtatEvaluation = { erreurs?: Record<string, string>; valeurs?: Record<string, string>; ok?: string } | null;

/** Etapes de mission ou l'equipe peut etre evaluee : une fois le travail fait. */
const STATUTS_EVALUATION = ['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'];

function valeurs(f: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, x] of f.entries()) if (typeof x === 'string' && !k.startsWith('$')) v[k] = x;
  return v;
}

const erreur = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue.');

/**
 * Evaluation d'un intervenant a l'issue d'une mission. Une evaluation
 * contestee ne se modifie plus que par le traitement de la contestation.
 */
export async function evaluer(missionId: string, intervenantId: string, _: EtatEvaluation, f: FormData): Promise<EtatEvaluation> {
  const ctx = await exigerAction('mission:modifier');
  const r = lireEvaluation(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };

  try {
    await transaction(async (c) => {
      const { rows: m } = await c.query('SELECT reference, statut FROM mission WHERE id = $1 FOR UPDATE', [missionId]);
      if (!m[0]) throw new Error('Mission introuvable.');
      if (!STATUTS_EVALUATION.includes(m[0].statut)) throw new Error('L’équipe s’évalue une fois la mission exécutée.');

      // seuls ceux qui ont effectivement travaille sont evalues
      const { rows: a } = await c.query(
        `SELECT 1 FROM affectation WHERE mission_id = $1 AND intervenant_id = $2 AND role = 'titulaire' AND presence IN ('present', 'retard')`,
        [missionId, intervenantId],
      );
      if (!a[0]) throw new Error('Seuls les intervenants pointés présents sur la mission sont évalués.');

      const { rows: e } = await c.query('SELECT id, contestee_le FROM evaluation WHERE mission_id = $1 AND intervenant_id = $2 FOR UPDATE', [missionId, intervenantId]);
      if (e[0]?.contestee_le) throw new Error('Cette évaluation est contestée : elle se modifie par le traitement de la contestation.');

      const { rows: ev } = await c.query<{ id: string }>(
        `INSERT INTO evaluation (intervenant_id, mission_id, notes, commentaire, evaluee_par, evaluee_le)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (intervenant_id, mission_id)
         DO UPDATE SET notes = EXCLUDED.notes, commentaire = EXCLUDED.commentaire, evaluee_par = EXCLUDED.evaluee_par, evaluee_le = now()
         RETURNING id`,
        [intervenantId, missionId, JSON.stringify(r.notes), r.commentaire, ctx.utilisateur.id],
      );
      const score = await recalculerScore(c, intervenantId, `Évaluation de la mission ${m[0].reference}`, {
        evaluationId: ev[0].id,
        utilisateurId: ctx.utilisateur.id,
      });
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: e[0] ? 'evaluation_modification' : 'evaluation', entite: 'intervenant', entiteId: intervenantId, details: { mission: m[0].reference, score } },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  revalidatePath(`/missions/${missionId}/evaluations`);
  revalidatePath(`/intervenants/${intervenantId}`);
  return { ok: 'Évaluation enregistrée.' };
}

/** L'intervenant conteste une evaluation (par telephone ou sur place) : l'equipe consigne le motif. */
export async function contester(evaluationId: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('profil:modifier');
  const motif = String(f.get('motif') ?? '').trim().slice(0, 1000);
  if (!motif) return 'Indiquez ce que l’intervenant conteste.';
  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `UPDATE evaluation SET contestee_le = now(), contestation_motif = $2, contestation_par = $3
          WHERE id = $1 AND contestee_le IS NULL RETURNING intervenant_id`,
        [evaluationId, motif, ctx.utilisateur.id],
      );
      if (!rows[0]) throw new Error('Évaluation introuvable ou déjà contestée.');
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'evaluation_contestation', entite: 'intervenant', entiteId: rows[0].intervenant_id, details: { evaluation: evaluationId } }, c);
      revalidatePath(`/intervenants/${rows[0].intervenant_id}`);
    });
  } catch (e) {
    return erreur(e);
  }
  return null;
}

/**
 * Traitement d'une contestation : maintenue, corrigee (nouvelles notes) ou
 * annulee (l'evaluation ne compte plus). Jamais par l'auteur de l'evaluation,
 * sauf un administrateur.
 */
export async function trancher(evaluationId: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('profil:verifier');
  const issue = String(f.get('issue')) as Issue;
  const explication = String(f.get('explication') ?? '').trim().slice(0, 1000);
  if (!(issue in ISSUES)) return 'Choisissez l’issue de la contestation.';
  if (!explication) return 'Expliquez la décision : elle sera communiquée à l’intervenant.';
  const correction = issue === 'corrigee' ? lireEvaluation(f) : null;
  if (correction && !correction.ok) return `Notes corrigées incomplètes : ${Object.values(correction.erreurs)[0]}`;

  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.intervenant_id, e.evaluee_par, e.contestee_le, e.contestation_issue, m.reference
           FROM evaluation e JOIN mission m ON m.id = e.mission_id WHERE e.id = $1 FOR UPDATE OF e`,
        [evaluationId],
      );
      const e = rows[0];
      if (!e || !e.contestee_le) throw new Error('Aucune contestation en cours sur cette évaluation.');
      if (e.contestation_issue) throw new Error('Cette contestation a déjà été traitée.');
      if (!peutTrancher(e, ctx.utilisateur)) throw new Error('L’auteur de l’évaluation ne peut pas trancher sa contestation.');

      await c.query(
        `UPDATE evaluation SET contestation_issue = $2, contestation_explication = $3,
                contestation_traitee_par = $4, contestation_traitee_le = now(),
                notes = coalesce($5::jsonb, notes)
          WHERE id = $1`,
        [evaluationId, issue, explication, ctx.utilisateur.id, correction?.ok ? JSON.stringify(correction.notes) : null],
      );
      const score = await recalculerScore(c, e.intervenant_id, `Contestation (${ISSUES[issue].toLowerCase()}) sur la mission ${e.reference}`, {
        evaluationId,
        utilisateurId: ctx.utilisateur.id,
      });
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'evaluation_contestation_traitee', entite: 'intervenant', entiteId: e.intervenant_id, details: { issue, score } },
        c,
      );
      revalidatePath(`/intervenants/${e.intervenant_id}`);
    });
  } catch (e) {
    return erreur(e);
  }
  return null;
}

/**
 * Nouvelle ponderation des criteres. Tous les scores sont recalcules dans
 * la meme transaction : aucun score ne reste calcule avec l'ancienne regle.
 */
export async function enregistrerPonderation(_: EtatEvaluation, f: FormData): Promise<EtatEvaluation> {
  const ctx = await exigerAction('parametre:gerer');
  const codes: CodeCritere[] = [...CRITERES_NOTES.map((c) => c.code), 'presence', 'missions_realisees'];
  const poids: Record<string, number> = {};
  const erreurs: Record<string, string> = {};
  for (const code of codes) {
    const n = Number(String(f.get(code) ?? '').trim());
    if (!Number.isInteger(n) || n < 0 || n > 100) erreurs[code] = 'Entier de 0 à 100.';
    else poids[code] = n;
  }
  if (!Object.keys(erreurs).length && Object.values(poids).every((p) => p === 0)) erreurs.general = 'Au moins un critère doit compter.';
  if (Object.keys(erreurs).length) return { erreurs, valeurs: valeurs(f) };

  let recalcules = 0;
  try {
    await transaction(async (c) => {
      const { rows: avant } = await c.query<{ code: string; poids: number }>('SELECT code, poids FROM critere_score');
      for (const code of codes) await c.query('UPDATE critere_score SET poids = $2 WHERE code = $1', [code, poids[code]]);
      const { rows } = await c.query<{ id: string }>(
        `SELECT DISTINCT i.id FROM intervenant i
          WHERE i.score IS NOT NULL
             OR EXISTS (SELECT 1 FROM evaluation e WHERE e.intervenant_id = i.id)
             OR EXISTS (SELECT 1 FROM affectation a WHERE a.intervenant_id = i.id AND a.presence IS NOT NULL)`,
      );
      for (const { id } of rows) await recalculerScore(c, id, 'Nouvelle pondération des critères', { utilisateurId: ctx.utilisateur.id });
      recalcules = rows.length;
      await consigner(
        {
          utilisateurId: ctx.utilisateur.id,
          action: 'ponderation',
          entite: 'parametre',
          details: { avant: Object.fromEntries(avant.map((a) => [a.code, Number(a.poids)])), apres: poids, recalcules },
        },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  revalidatePath('/parametres/score');
  revalidatePath('/intervenants');
  return { ok: `Pondération enregistrée. ${recalcules} score${recalcules > 1 ? 's' : ''} recalculé${recalcules > 1 ? 's' : ''}.` };
}
