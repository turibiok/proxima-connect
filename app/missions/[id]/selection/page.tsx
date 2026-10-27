import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { periode } from '@/lib/format';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { ajouterProfils } from '@/lib/missions/actions';
import { chargerMission } from '@/lib/missions/donnees';
import { chevauchement, compatibilite, joursMission, type Critere } from '@/lib/missions/regles';
import { JOURS, libelle, libelleCategorie, type StatutProfil } from '@/lib/referentiel';
import { PuceStatut } from '@/components/Statut';

export const metadata = { title: 'Sélection des profils' };

interface Profil {
  id: string;
  reference: string;
  nom: string;
  prenoms: string;
  telephone: string;
  ville: string;
  quartier: string | null;
  zones: string[];
  categories_missions: string[];
  jours_disponibles: string[];
  competences: string[];
  score: number | null;
  statut: StatutProfil;
  missions_realisees: number;
}

/**
 * Selection des profils compatibles (cahier des charges 5.3) : le vivier
 * verifie est classe selon le besoin — type de mission, zone, jours,
 * competences, score — et les profils deja engages ailleurs aux memes dates
 * sont signales. La decision reste humaine : on coche, on ajoute.
 */
export default async function Selection({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tous?: string }>;
}) {
  await exiger('mission:modifier');
  const { id } = await params;
  const { tous } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();
  if (!['selection', 'preparation', 'execution'].includes(m.statut)) redirect(`/missions/${id}`);

  const [profils, engagements, dejaLa] = await Promise.all([
    requete<Profil>(
      `SELECT i.id, i.reference, i.nom, i.prenoms, i.telephone, i.ville, i.quartier, i.zones, i.categories_missions,
              i.jours_disponibles, i.competences, i.score, i.statut,
              (SELECT count(*) FROM affectation a WHERE a.intervenant_id = i.id AND a.presence IN ('present', 'retard'))::int AS missions_realisees
         FROM intervenant i WHERE i.statut IN ('verifie', 'actif')`,
    ),
    // engagements acceptes sur d'autres missions vivantes, pour detecter les chevauchements
    requete<{ intervenant_id: string; debut: string | null; fin: string | null; reference: string }>(
      `SELECT a.intervenant_id, m.date_debut AS debut, m.date_fin AS fin, m.reference
         FROM affectation a JOIN mission m ON m.id = a.mission_id
        WHERE a.reponse = 'accepte' AND m.id <> $1 AND m.statut NOT IN ('annulee', 'payee')`,
      [id],
    ),
    requete<{ intervenant_id: string; role: string }>('SELECT intervenant_id, role FROM affectation WHERE mission_id = $1', [id]),
  ]);

  const besoin = {
    categorie: m.categorie,
    zone: m.zone,
    jours: joursMission(m.date_debut, m.date_fin),
    competences: m.competences,
    score_minimum: m.score_minimum,
  };
  const periodeMission = { debut: m.date_debut, fin: m.date_fin };
  const presents = new Map(dejaLa.map((d) => [d.intervenant_id, d.role]));

  const classes = profils
    .map((p) => {
      const conflit = engagements.find((e) => e.intervenant_id === p.id && chevauchement(periodeMission, e));
      return { p, conflit, ...compatibilite(besoin, p, !!conflit) };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.points - a.points || (b.p.score ?? 0) - (a.p.score ?? 0));

  const eligibles = classes.filter((c) => c.eligible);
  const affiches = tous ? classes : eligibles;
  const manquent = Math.max(0, m.nb_profils_requis - dejaLa.filter((d) => d.role === 'titulaire').length);

  return (
    <div className="space-y-5">
      <Link href={`/missions/${id}`} className="text-sm text-marque hover:underline">← {m.reference} · {m.titre}</Link>

      <div>
        <h1 className="text-2xl font-bold">Sélection des profils</h1>
        <p className="mt-1 text-sm text-encre-douce">
          Besoin : <strong>{libelleCategorie(m.categorie)}</strong> · {m.zone ?? 'zone non précisée'} · {periode(m.date_debut, m.date_fin)}
          {besoin.jours && ` (${besoin.jours.map((j) => libelle(JOURS, j).toLowerCase()).join(', ')})`}
          {m.competences.length > 0 && ` · ${m.competences.join(', ')}`}
          {m.score_minimum !== null && ` · score ≥ ${m.score_minimum}`}
        </p>
        <p className="mt-1 text-sm">
          {manquent > 0 ? `${manquent} titulaire${manquent > 1 ? 's' : ''} à trouver` : 'Effectif titulaire atteint'}. Ajoutez quelques profils de plus en réserve : ils remplaceront un absent.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/missions/${id}/selection`} className={`rounded-full border px-3 py-1 ${!tous ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
          Compatibles <span className="text-encre-douce">{eligibles.length}</span>
        </Link>
        <Link href={`/missions/${id}/selection?tous=1`} className={`rounded-full border px-3 py-1 ${tous ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
          Tout le vivier vérifié <span className="text-encre-douce">{classes.length}</span>
        </Link>
      </div>

      {affiches.length === 0 ? (
        <div className="carte p-10 text-center text-encre-douce">
          Aucun profil vérifié ne correspond.{' '}
          <Link href={`/missions/${id}/selection?tous=1`} className="text-marque hover:underline">Voir tout le vivier</Link> ou{' '}
          <Link href="/intervenants?statut=en_attente" className="text-marque hover:underline">vérifier les profils en attente</Link>.
        </div>
      ) : (
        <form action={ajouterProfils.bind(null, id)} className="space-y-3">
          <div className="carte overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
                <tr>
                  <th className="w-10 px-3 py-2.5"><span className="sr-only">Choisir</span></th>
                  <th className="px-3 py-2.5">Intervenant</th>
                  <th className="px-3 py-2.5 text-right">Adéquation</th>
                  <th className="px-3 py-2.5">Critères</th>
                  <th className="px-3 py-2.5">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-trait">
                {affiches.map(({ p, points, eligible, criteres, conflit }) => {
                  const role = presents.get(p.id);
                  return (
                    <tr key={p.id} className={eligible ? '' : 'bg-papier/50 text-encre-douce'}>
                      <td className="px-3 py-2.5">
                        {role ? (
                          <span title="Déjà dans l’équipe" className="text-ok">✓</span>
                        ) : (
                          <input type="checkbox" name="intervenant_id" value={p.id} aria-label={`Choisir ${p.nom} ${p.prenoms}`} className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/intervenants/${p.id}`} target="_blank" className="font-medium text-marque-fonce hover:underline">
                          {p.nom} {p.prenoms}
                        </Link>
                        <div className="text-xs text-encre-douce">
                          {[p.ville, p.quartier].filter(Boolean).join(' · ')} · {afficherTelephone(p.telephone)} · {p.missions_realisees} mission{p.missions_realisees > 1 ? 's' : ''}
                          {role && <> · <strong className="text-ok">déjà {role === 'remplacant' ? 'en réserve' : 'titulaire'}</strong></>}
                          {conflit && <> · engagé sur {conflit.reference}</>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-lg font-bold tabular-nums">{points}</span>
                        <span className="text-xs text-encre-douce">/100</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {criteres.map((c) => <Puce key={c.code} c={c} />)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><PuceStatut statut={p.statut} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="carte sticky bottom-3 flex flex-wrap items-center gap-3 p-3 shadow-lg">
            <span className="text-sm">Ajouter les profils cochés</span>
            <select name="role" aria-label="Rôle" className="champ w-auto">
              <option value="titulaire">comme titulaires</option>
              <option value="remplacant">en réserve (remplaçants)</option>
            </select>
            <button className="btn-primaire">Ajouter à l’équipe</button>
            <span className="text-xs text-encre-douce">Les propositions s’envoient ensuite depuis la page de la mission.</span>
          </div>
        </form>
      )}
    </div>
  );
}

function Puce({ c }: { c: Critere }) {
  const style = c.ok === true ? 'bg-ok-pale text-ok' : c.ok === false ? 'bg-danger-pale text-danger' : 'bg-papier text-encre-douce';
  const signe = c.ok === true ? '✓' : c.ok === false ? '✗' : '–';
  return (
    <span className={`puce font-medium ${style}`} title={c.detail}>
      {signe} {c.libelle}
      <span className="sr-only"> : {c.detail}</span>
    </span>
  );
}
