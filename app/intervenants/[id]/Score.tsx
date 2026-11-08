import Link from 'next/link';
import type { Contexte } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { date, dateHeure } from '@/lib/format';
import {
  calculerScore,
  CRITERES_NOTES,
  evolution,
  EVALUATIONS_RETENUES,
  ISSUES,
  peutTrancher,
  type CodeCritere,
  type Issue,
  type Notes,
} from '@/lib/score/regles';
import { ResumeNotes } from '@/components/Notes';
import { Contestation, Traitement } from './ScoreActions';

const LIBELLES: Record<CodeCritere, string> = {
  ...(Object.fromEntries(CRITERES_NOTES.map((c) => [c.code, c.libelle])) as Record<CodeCritere, string>),
  presence: 'Taux de présence',
  missions_realisees: 'Missions réalisées',
};

interface Evaluation {
  id: string;
  notes: Notes;
  commentaire: string | null;
  evaluee_le: Date;
  evaluee_par: string | null;
  evaluateur: string | null;
  mission_id: string;
  reference: string;
  titre: string;
  contestee_le: Date | null;
  contestation_motif: string | null;
  contestation_issue: Issue | null;
  contestation_explication: string | null;
  traitee_par: string | null;
  contestation_traitee_le: Date | null;
}

/**
 * Le PROXIMA SCORE expose : d'ou il vient (critere par critere), comment il
 * a evolue, et chaque evaluation qui l'a fait varier, avec sa contestation
 * eventuelle (cahier des charges 5.5 : transparence et contestation).
 */
export async function SectionScore({
  intervenantId,
  score,
  ctx,
  vue = 'equipe',
}: {
  intervenantId: string;
  score: number | null;
  /** null dans l'espace intervenant : lecture seule */
  ctx: Contexte | null;
  /** « intervenant » : sans nom d'evaluateur ni lien vers le back-office */
  vue?: 'equipe' | 'intervenant';
}) {
  const equipe = vue === 'equipe';
  const [criteres, evaluations, presence, historique] = await Promise.all([
    requete<{ code: CodeCritere; poids: number; ordre: number }>('SELECT code, poids, ordre FROM critere_score ORDER BY ordre'),
    requete<Evaluation>(
      `SELECT e.id, e.notes, e.commentaire, e.evaluee_le, e.evaluee_par, u.nom_complet AS evaluateur,
              m.id AS mission_id, m.reference, m.titre,
              e.contestee_le, e.contestation_motif, e.contestation_issue, e.contestation_explication,
              ut.nom_complet AS traitee_par, e.contestation_traitee_le
         FROM evaluation e JOIN mission m ON m.id = e.mission_id
         LEFT JOIN utilisateur u ON u.id = e.evaluee_par
         LEFT JOIN utilisateur ut ON ut.id = e.contestation_traitee_par
        WHERE e.intervenant_id = $1 ORDER BY e.evaluee_le DESC`,
      [intervenantId],
    ),
    requete<{ notees: number; presentes: number }>(
      `SELECT count(*) FILTER (WHERE presence IS NOT NULL)::int AS notees,
              count(*) FILTER (WHERE presence IN ('present', 'retard'))::int AS presentes
         FROM affectation WHERE intervenant_id = $1 AND role = 'titulaire'`,
      [intervenantId],
    ),
    requete<{ score: number; cause: string; calcule_le: Date }>(
      'SELECT score, cause, calcule_le FROM score_historique WHERE intervenant_id = $1 ORDER BY calcule_le DESC LIMIT 12',
      [intervenantId],
    ),
  ]);

  // meme calcul que l'enregistrement : l'explication affichee est exacte
  const retenues = evaluations.filter((e) => e.contestation_issue !== 'annulee').slice(0, EVALUATIONS_RETENUES);
  const { detail } = calculerScore({
    poids: Object.fromEntries(criteres.map((c) => [c.code, Number(c.poids)])),
    evaluations: retenues,
    presence: presence[0],
    missionsRealisees: presence[0].presentes,
  });
  const totalPoids = detail.filter((l) => l.valeur !== null).reduce((t, l) => t + l.poids, 0) || 1;
  const ecart = evolution(historique);
  const enCours = evaluations.filter((e) => e.contestee_le && !e.contestation_issue).length;

  return (
    <section id="score" className="carte scroll-mt-24 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-encre-douce">PROXIMA SCORE</h2>
          <p className="mt-1 text-4xl font-bold tabular-nums">
            {score === null ? '-' : Math.round(score)}
            {score !== null && <span className="text-base font-normal text-encre-douce"> / 100</span>}
            {ecart !== null && ecart !== 0 && (
              <span className={`ml-3 text-sm font-semibold ${ecart > 0 ? 'text-ok' : 'text-danger'}`}>
                {ecart > 0 ? '+' : ''}{String(ecart).replace('.', ',')}
              </span>
            )}
          </p>
          <p className="text-xs text-encre-douce">
            {score === null
              ? 'Pas encore de score : il apparaît après la première évaluation ou la première présence pointée.'
              : `Calculé sur ${retenues.length} évaluation${retenues.length > 1 ? 's' : ''} (les ${EVALUATIONS_RETENUES} plus récentes comptent) et ${presence[0].notees} présence${presence[0].notees > 1 ? 's' : ''} pointée${presence[0].notees > 1 ? 's' : ''}.`}
          </p>
        </div>
        {enCours > 0 && <span className="puce bg-alerte-pale text-alerte">{enCours} contestation{enCours > 1 ? 's' : ''} en cours</span>}
      </div>

      {score !== null && (
        <table className="mb-5 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-encre-douce">
            <tr>
              <th className="pb-2 font-medium">Critère</th>
              <th className="pb-2 font-medium">Valeur</th>
              <th className="pb-2 text-right font-medium">Poids</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-trait">
            {detail.map((l) => (
              <tr key={l.code} className={l.valeur === null ? 'text-encre-douce' : ''}>
                <td className="py-2 pr-3">
                  {LIBELLES[l.code]}
                  <div className="text-xs text-encre-douce">{l.base}</div>
                </td>
                <td className="w-2/5 py-2 pr-3">
                  {l.valeur === null ? (
                    <span className="text-xs">Ne compte pas</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="h-2 flex-1 rounded-full bg-papier">
                        <span className={`block h-full rounded-full ${l.valeur >= 70 ? 'bg-ok' : l.valeur >= 40 ? 'bg-accent' : 'bg-danger'}`} style={{ width: `${l.valeur}%` }} />
                      </span>
                      <span className="w-8 text-right tabular-nums">{Math.round(l.valeur)}</span>
                    </div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-encre-douce">
                  {l.valeur === null || !l.poids ? '-' : `${Math.round((l.poids / totalPoids) * 100)} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {historique.length > 0 && (
        <details className="mb-5">
          <summary className="cursor-pointer text-sm font-medium">Évolution du score ({historique.length} dernier{historique.length > 1 ? 's' : ''} calcul{historique.length > 1 ? 's' : ''})</summary>
          <ol className="mt-2 space-y-1 text-sm">
            {historique.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="text-encre-douce">{dateHeure(h.calcule_le)} · {h.cause}</span>
                <span className="font-semibold tabular-nums">{Math.round(h.score)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <h3 className="mb-2 text-sm font-bold">Évaluations ({evaluations.length})</h3>
      {!equipe && (
        <p className="mb-3 rounded-lg bg-marque-pale px-3 py-2 text-xs text-marque-fonce">
          Vous n’êtes pas d’accord avec une évaluation ? Contactez l’équipe PROXIMA en expliquant pourquoi. Votre contestation sera
          examinée par une autre personne que l’auteur de l’évaluation, et la décision vous sera expliquée.
        </p>
      )}
      {evaluations.length === 0 ? (
        <p className="text-sm text-encre-douce">Aucune évaluation pour le moment.</p>
      ) : (
        <ul className="divide-y divide-trait">
          {evaluations.map((e) => {
            const enAttente = !!e.contestee_le && !e.contestation_issue;
            return (
              <li key={e.id} className={`py-3 ${e.contestation_issue === 'annulee' ? 'opacity-60' : ''}`}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  {equipe ? (
                    <Link href={`/missions/${e.mission_id}`} className="font-medium hover:underline">
                      <span className="font-mono text-xs">{e.reference}</span> {e.titre}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.titre}</span>
                  )}
                  <span className="text-xs text-encre-douce">{date(e.evaluee_le)}{equipe && ` · ${e.evaluateur ?? '-'}`}</span>
                </div>
                <ResumeNotes notes={e.notes} />
                {e.commentaire && <p className="mt-1 whitespace-pre-line text-sm">« {e.commentaire} »</p>}

                {e.contestee_le && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${enAttente ? 'bg-alerte-pale text-alerte' : 'bg-papier'}`}>
                    <strong>Contestée le {date(e.contestee_le)}</strong> : {e.contestation_motif}
                    {e.contestation_issue && (
                      <p className="mt-1 text-encre">
                        <strong>{ISSUES[e.contestation_issue]}</strong>{equipe && ` par ${e.traitee_par ?? '-'}`}
                        {e.contestation_traitee_le && ` le ${date(e.contestation_traitee_le)}`} : {e.contestation_explication}
                      </p>
                    )}
                  </div>
                )}

                {ctx && !e.contestee_le && ctx.peut('profil:modifier') && <Contestation evaluationId={e.id} />}
                {ctx && enAttente && ctx.peut('profil:verifier') && (
                  peutTrancher(e, ctx.utilisateur)
                    ? <Traitement evaluationId={e.id} notes={e.notes} />
                    : <p className="mt-2 text-xs text-encre-douce">Vous êtes l’auteur de cette évaluation : une autre personne doit trancher la contestation.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
