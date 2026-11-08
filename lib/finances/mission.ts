import 'server-only';
import type { PoolClient } from 'pg';
import { consigner } from '@/lib/journal';
import { paiementsDus, type LigneEquipePayable } from './regles';

/**
 * Liens entre le cycle de la mission et les paiements (module 5.6).
 * Appele dans la transaction du changement d'etape : l'etape et les
 * paiements ne peuvent pas diverger.
 */

/**
 * A la validation (« controlee »), un paiement « a payer » par intervenant
 * pointe present ; le delai de 48 a 72 h court a partir de la. Une mission
 * qui repasse par cette etape garde ses paiements existants et leur date.
 */
export async function genererPaiements(c: PoolClient, missionId: string, utilisateurId: string): Promise<number> {
  const { rows: m } = await c.query<{ reference: string; remuneration_agent_fcfa: number | null }>(
    'SELECT reference, remuneration_agent_fcfa FROM mission WHERE id = $1',
    [missionId],
  );
  const { rows } = await c.query<LigneEquipePayable>(
    'SELECT intervenant_id, role, reponse, presence, remuneration_proposee_fcfa FROM affectation WHERE mission_id = $1',
    [missionId],
  );
  const { dus, sansMontant } = paiementsDus(rows, m[0].remuneration_agent_fcfa);
  if (sansMontant.length) throw new Error('Fixez la rémunération par intervenant : elle sert à calculer ce qui est dû à chacun.');

  let crees = 0;
  let total = 0;
  for (const d of dus) {
    const r = await c.query(
      `INSERT INTO paiement_intervenant (mission_id, intervenant_id, montant_fcfa, montant_initial_fcfa, du_depuis)
       VALUES ($1, $2, $3, $3, now()) ON CONFLICT (mission_id, intervenant_id) DO NOTHING`,
      [missionId, d.intervenant_id, d.montant],
    );
    if (r.rowCount) {
      crees++;
      total += d.montant;
    }
  }
  if (crees) {
    await consigner({ utilisateurId, action: 'paiements_generes', entite: 'mission', entiteId: missionId, details: { reference: m[0].reference, nombre: crees, total } }, c);
  }
  return crees;
}

/**
 * Retour de « controlee » a « preuves collectees » : les paiements non
 * encore verses sont retires (ils seront recrees a la nouvelle validation).
 * Refuse des qu'un paiement a ete verse ou conteste : l'argent est parti.
 */
export async function retirerPaiements(c: PoolClient, missionId: string, utilisateurId: string, reference: string) {
  const { rows } = await c.query<{ engages: number }>(
    `SELECT count(*)::int AS engages FROM paiement_intervenant WHERE mission_id = $1 AND statut <> 'a_payer'`,
    [missionId],
  );
  if (rows[0].engages) throw new Error('Des paiements ont déjà été versés ou contestés : la mission ne peut plus revenir avant le contrôle.');
  const r = await c.query(`DELETE FROM paiement_intervenant WHERE mission_id = $1 AND statut = 'a_payer'`, [missionId]);
  if (r.rowCount) {
    await consigner({ utilisateurId, action: 'paiements_retires', entite: 'mission', entiteId: missionId, details: { reference, nombre: r.rowCount } }, c);
  }
}

/** Etat financier d'une mission, pour la condition de l'etape « payee ». */
export const SQL_ETAT_FINANCIER = `
  SELECT (SELECT count(*) FROM paiement_intervenant WHERE mission_id = $1 AND statut <> 'paye')::int AS "paiementsOuverts",
         (SELECT count(*) FROM facture WHERE mission_id = $1 AND type = 'facture' AND statut <> 'annulee')::int AS factures,
         (SELECT count(*) FROM facture WHERE mission_id = $1 AND statut IN ('emise', 'partielle'))::int AS "nonSoldees"`;

export async function etatFinancier(c: PoolClient, missionId: string) {
  const { rows } = await c.query<{ paiementsOuverts: number; factures: number; nonSoldees: number }>(SQL_ETAT_FINANCIER, [missionId]);
  return rows[0];
}
