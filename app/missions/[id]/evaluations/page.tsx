import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { dateHeure } from '@/lib/format';
import { chargerMission } from '@/lib/missions/donnees';
import { ISSUES, type Issue, type Notes } from '@/lib/score/regles';
import { PuceMission } from '@/components/Statut';
import { ResumeNotes } from '@/components/Notes';
import { FormulaireEvaluation } from './Formulaire';

export const metadata = { title: 'Évaluation de l’équipe' };

const STATUTS_EVALUATION = ['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'];

/**
 * Evaluation de chaque intervenant pointe present sur la mission. Les notes
 * alimentent le PROXIMA SCORE ; l'intervenant peut contester (fiche profil).
 */
export default async function Evaluations({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('mission:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();

  const equipe = await requete<{
    intervenant_id: string;
    nom: string;
    prenoms: string;
    reference: string;
    presence: 'present' | 'retard';
    score: number | null;
    evaluation_id: string | null;
    notes: Notes | null;
    commentaire: string | null;
    evaluee_le: Date | null;
    evaluateur: string | null;
    contestee_le: Date | null;
    contestation_issue: Issue | null;
  }>(
    `SELECT i.id AS intervenant_id, i.nom, i.prenoms, i.reference, a.presence, i.score,
            e.id AS evaluation_id, e.notes, e.commentaire, e.evaluee_le, u.nom_complet AS evaluateur,
            e.contestee_le, e.contestation_issue
       FROM affectation a
       JOIN intervenant i ON i.id = a.intervenant_id
       LEFT JOIN evaluation e ON e.mission_id = a.mission_id AND e.intervenant_id = a.intervenant_id
       LEFT JOIN utilisateur u ON u.id = e.evaluee_par
      WHERE a.mission_id = $1 AND a.role = 'titulaire' AND a.presence IN ('present', 'retard')
      ORDER BY i.nom, i.prenoms`,
    [id],
  );

  const ouverte = STATUTS_EVALUATION.includes(m.statut);
  const modifiable = ouverte && ctx.peut('mission:modifier');
  const faites = equipe.filter((p) => p.evaluation_id).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={`/missions/${id}`} className="text-sm text-marque hover:underline">← {m.reference} · {m.titre}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Évaluation de l’équipe</h1>
        <PuceMission statut={m.statut} />
      </div>
      <p className="text-sm text-encre-douce">
        {faites} évaluation{faites > 1 ? 's' : ''} sur {equipe.length}. Chaque évaluation met à jour le PROXIMA SCORE de l’intervenant.
        Notez sur des faits : l’intervenant peut contester, et la contestation est tranchée par une autre personne.
      </p>

      {!ouverte && (
        <div className="carte p-6 text-center text-sm text-encre-douce">
          L’équipe s’évalue une fois la mission exécutée, à partir de l’étape « Preuves collectées ».
        </div>
      )}

      {ouverte && equipe.length === 0 && (
        <div className="carte p-6 text-center text-sm text-encre-douce">Aucun intervenant pointé présent sur cette mission.</div>
      )}

      {ouverte &&
        equipe.map((p) => (
          <section key={p.intervenant_id} className="carte p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/intervenants/${p.intervenant_id}`} className="font-semibold text-marque-fonce hover:underline">
                  {p.nom} {p.prenoms}
                </Link>
                <div className="text-xs text-encre-douce">
                  <span className="font-mono">{p.reference}</span> · {p.presence === 'retard' ? 'présent, en retard' : 'présent'}
                  {p.score !== null && ` · score actuel ${Math.round(p.score)}`}
                </div>
              </div>
              {p.evaluation_id ? (
                <span className={`puce ${p.contestee_le && !p.contestation_issue ? 'bg-alerte-pale text-alerte' : 'bg-ok-pale text-ok'}`}>
                  {p.contestee_le && !p.contestation_issue ? 'Contestée' : p.contestation_issue ? ISSUES[p.contestation_issue] : 'Évaluée'}
                </span>
              ) : (
                <span className="puce bg-papier text-encre-douce ring-1 ring-trait">À évaluer</span>
              )}
            </div>

            {p.notes && (
              <div className="mb-3 space-y-2">
                <ResumeNotes notes={p.notes} />
                {p.commentaire && <p className="whitespace-pre-line text-sm">« {p.commentaire} »</p>}
                <p className="text-xs text-encre-douce">Par {p.evaluateur ?? '-'}, le {p.evaluee_le && dateHeure(p.evaluee_le)}</p>
              </div>
            )}

            {modifiable && !p.contestee_le && (
              <FormulaireEvaluation
                missionId={id}
                intervenantId={p.intervenant_id}
                initiales={p.notes ?? undefined}
                commentaire={p.commentaire}
              />
            )}
            {p.contestee_le && (
              <p className="text-xs text-encre-douce">
                Évaluation contestée : elle se traite depuis la{' '}
                <Link href={`/intervenants/${p.intervenant_id}#score`} className="text-marque hover:underline">fiche de l’intervenant</Link>.
              </p>
            )}
          </section>
        ))}
    </div>
  );
}
