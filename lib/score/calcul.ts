import 'server-only';
import type { PoolClient } from 'pg';
import { calculerScore, EVALUATIONS_RETENUES, type CodeCritere, type Notes } from './regles';

/**
 * Recalcule le PROXIMA SCORE d'un intervenant et en garde la trace.
 *
 * Appele dans la transaction de ce qui fait varier le score (evaluation,
 * presence pointee, contestation tranchee, nouvelle ponderation) : le score
 * et son historique ne peuvent pas diverger de leurs causes.
 *
 * Module serveur ordinaire, pas une action : il n'est pas appelable depuis
 * le navigateur.
 */
export async function recalculerScore(
  c: PoolClient,
  intervenantId: string,
  cause: string,
  options: { evaluationId?: string | null; utilisateurId?: string | null } = {},
): Promise<number | null> {
  // Requetes l'une apres l'autre : une connexion pg n'en execute qu'une a la
  // fois (les lancer ensemble est deprecie et refuse a partir de pg 9).
  // Le verrou sur l'intervenant d'abord : deux recalculs simultanes du meme
  // profil s'attendent au lieu de s'ecraser.
  const actuel = await c.query<{ score: number | null }>('SELECT score FROM intervenant WHERE id = $1 FOR UPDATE', [intervenantId]);
  if (!actuel.rows[0]) throw new Error('Intervenant introuvable.');
  const poids = await c.query<{ code: CodeCritere; poids: number }>('SELECT code, poids FROM critere_score');
  const evaluations = await c.query<{ notes: Notes }>(
    `SELECT notes FROM evaluation
      WHERE intervenant_id = $1 AND coalesce(contestation_issue, '') <> 'annulee'
      ORDER BY evaluee_le DESC LIMIT $2`,
    [intervenantId, EVALUATIONS_RETENUES],
  );
  const presence = await c.query<{ notees: number; presentes: number }>(
    `SELECT count(*) FILTER (WHERE presence IS NOT NULL)::int AS notees,
            count(*) FILTER (WHERE presence IN ('present', 'retard'))::int AS presentes
       FROM affectation WHERE intervenant_id = $1 AND role = 'titulaire'`,
    [intervenantId],
  );

  const { score, detail } = calculerScore({
    poids: Object.fromEntries(poids.rows.map((p) => [p.code, Number(p.poids)])),
    evaluations: evaluations.rows,
    presence: presence.rows[0],
    missionsRealisees: presence.rows[0].presentes,
  });

  const avant = actuel.rows[0].score;
  if (score === avant) return score;
  await c.query('UPDATE intervenant SET score = $2, maj_le = now() WHERE id = $1', [intervenantId, score]);
  // l'historique ne garde que des scores : un retour a « pas de score »
  // (evaluation annulee d'un profil neuf) se lit sur la fiche, pas ici
  if (score !== null) {
    await c.query(
      `INSERT INTO score_historique (intervenant_id, score, evaluation_id, cause, detail, calcule_par)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [intervenantId, score, options.evaluationId ?? null, cause, JSON.stringify(detail), options.utilisateurId ?? null],
    );
  }
  return score;
}
