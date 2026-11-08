import 'server-only';
import { transaction } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { completerEquipe } from './selection';

export type CanalReponse = 'sms' | 'whatsapp' | 'espace' | 'delai';

/**
 * Enregistre la reponse d'un intervenant a une proposition, hors de l'equipe
 * (SMS, espace intervenant, delai depasse). Si la mission est en selection
 * automatique, un refus libere la place, aussitot reproposee.
 */
export async function enregistrerReponse(
  affectationId: string,
  reponse: 'accepte' | 'refuse',
  canal: CanalReponse,
  motif: string | null = null,
): Promise<{ ok: true; missionId: string } | { ok: false; erreur: string }> {
  const r = await transaction(async (c) => {
    const { rows } = await c.query(
      `SELECT a.id, a.mission_id, a.reponse, a.proposee_le, m.statut, m.reference, m.selection_auto, i.nom, i.prenoms
         FROM affectation a JOIN mission m ON m.id = a.mission_id JOIN intervenant i ON i.id = a.intervenant_id
        WHERE a.id = $1 FOR UPDATE OF a`,
      [affectationId],
    );
    const a = rows[0];
    if (!a) return { ok: false as const, erreur: 'Proposition introuvable.' };
    if (!a.proposee_le || a.reponse !== 'en_attente') return { ok: false as const, erreur: 'Cette proposition a déjà reçu une réponse.' };
    if (!['selection', 'preparation', 'execution'].includes(a.statut)) return { ok: false as const, erreur: 'Cette mission n’est plus en recrutement.' };
    await c.query(
      `UPDATE affectation SET reponse = $2, reponse_le = now(), reponse_canal = $3, motif_refus = $4 WHERE id = $1`,
      [affectationId, reponse, canal, reponse === 'refuse' ? motif : null],
    );
    await consigner(
      {
        utilisateurId: null, action: 'affectation_reponse', entite: 'mission', entiteId: a.mission_id,
        details: { reference: a.reference, intervenant: `${a.nom} ${a.prenoms}`, reponse, canal, motif: motif ?? undefined },
      },
      c,
    );
    return { ok: true as const, missionId: a.mission_id as string, completer: reponse === 'refuse' && a.selection_auto };
  });
  if (!r.ok) return r;
  if (r.completer) await completerEquipe(r.missionId, null);
  return { ok: true, missionId: r.missionId };
}
