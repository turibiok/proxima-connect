import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { dateHeure } from '@/lib/format';
import { EVALUATIONS_RETENUES, PALIER_MISSIONS } from '@/lib/score/regles';
import { FormulairePonderation } from './Formulaire';

export const metadata = { title: 'Pondération du score' };

export default async function ParametresScore() {
  await exiger('parametre:gerer');
  const [criteres, dernier, repartition] = await Promise.all([
    requete<{ code: string; libelle: string; poids: number; calcule: boolean }>('SELECT code, libelle, poids, calcule FROM critere_score ORDER BY ordre'),
    une<{ cree_le: Date; auteur: string | null }>(
      `SELECT j.cree_le, u.nom_complet AS auteur FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.action = 'ponderation' ORDER BY j.cree_le DESC LIMIT 1`,
    ),
    une<{ notes: number; moyenne: number | null }>('SELECT count(score)::int AS notes, avg(score)::float AS moyenne FROM intervenant'),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Pondération du PROXIMA SCORE</h1>
        <p className="mt-1 text-sm text-encre-douce">
          Le score de chaque intervenant (0 à 100) est la moyenne pondérée de huit critères. À fixer par la direction
          (note de cadrage, point 7.2).
        </p>
      </div>

      <section className="carte p-5">
        <FormulairePonderation criteres={criteres.map((c) => ({ ...c, poids: Number(c.poids) }))} />
        {dernier && (
          <p className="mt-3 text-xs text-encre-douce">Dernière modification le {dateHeure(dernier.cree_le)} par {dernier.auteur ?? '-'}.</p>
        )}
      </section>

      <section className="carte space-y-2 p-5 text-sm">
        <h2 className="font-bold">Comment le score est calculé</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Les critères notés (1 à 5) sont ramenés sur 100 : 1 vaut 0, 3 vaut 50, 5 vaut 100. Seules les {EVALUATIONS_RETENUES} évaluations les plus récentes comptent.</li>
          <li>Le taux de présence est la part des missions où l’intervenant a été pointé présent (un retard compte comme présent ; il pèse sur la ponctualité).</li>
          <li>Les missions réalisées donnent la note pleine à partir de {PALIER_MISSIONS} missions.</li>
          <li>Un critère sans donnée (pas d’avis client, par exemple) ne compte pas : son poids est réparti sur les autres.</li>
          <li>Une évaluation annulée après contestation ne compte plus.</li>
        </ul>
        <p className="text-encre-douce">
          Aujourd’hui : {repartition?.notes ?? 0} intervenant{(repartition?.notes ?? 0) > 1 ? 's' : ''} noté{(repartition?.notes ?? 0) > 1 ? 's' : ''}
          {repartition?.moyenne != null && `, score moyen ${Math.round(repartition.moyenne)}`}.
        </p>
      </section>
    </div>
  );
}
