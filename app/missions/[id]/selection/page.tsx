import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { periode } from '@/lib/format';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { ajouterProfils } from '@/lib/missions/actions';
import { candidatsClasses, chargerMission } from '@/lib/missions/donnees';
import { type Critere } from '@/lib/missions/regles';
import { choisirCandidats, configFournisseur, envoiAutomatiquePossible, nombreReserve } from '@/lib/automatisation/regles';
import { SelectionAutomatique } from './Automatique';
import { JOURS, libelle, libelleCategorie, type StatutProfil } from '@/lib/referentiel';
import { PuceStatut } from '@/components/Statut';

export const metadata = { title: 'Sélection des profils' };

/**
 * Selection des profils compatibles (cahier des charges 5.3) : le vivier
 * verifie est classe selon le besoin (type de mission, zone, jours,
 * competences, score) et les profils deja engages ailleurs aux memes dates
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

  const [{ besoin, classes }, dejaLa] = await Promise.all([
    candidatsClasses({ id, categorie: m.categorie, zone: m.zone, date_debut: m.date_debut, date_fin: m.date_fin, competences: m.competences, score_minimum: m.score_minimum }),
    requete<{ intervenant_id: string; role: string; reponse: string; presence: string | null; remplace: boolean }>(
      `SELECT a.intervenant_id, a.role, a.reponse, a.presence,
              EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id) AS remplace
         FROM affectation a WHERE a.mission_id = $1`,
      [id],
    ),
  ]);
  // apercu de la selection automatique (phase 3) : meme regle que son execution
  const enLice = (role: string) => dejaLa.filter((a) => a.role === role && a.reponse !== 'refuse' && !a.remplace && a.presence !== 'absent').length;
  const choix = choisirCandidats(
    classes.map((x) => ({ id: x.p.id, eligible: x.eligible, points: x.points, score: x.p.score })),
    {
      titulaires: m.nb_profils_requis - enLice('titulaire'),
      remplacants: nombreReserve(m.nb_profils_requis, m.reserve_pourcent) - enLice('remplacant'),
      exclus: new Set(dejaLa.map((a) => a.intervenant_id)),
    },
  );
  const nomDe = new Map(classes.map((x) => [x.p.id, `${x.p.prenoms.split(/\s+/)[0]} ${x.p.nom}`]));
  const presents = new Map(dejaLa.map((d) => [d.intervenant_id, d.role]));

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

      <SelectionAutomatique
        missionId={id}
        actif={m.selection_auto}
        reserve={m.reserve_pourcent}
        delai={m.delai_reponse_heures}
        envoi={envoiAutomatiquePossible(configFournisseur(process.env))}
        apercu={{ titulaires: choix.titulaires.map((x) => nomDe.get(x)!), remplacants: choix.remplacants.map((x) => nomDe.get(x)!) }}
      />

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
  const signe = c.ok === true ? '✓' : c.ok === false ? '✗' : '-';
  return (
    <span className={`puce font-medium ${style}`} title={c.detail}>
      {signe} {c.libelle}
      <span className="sr-only"> : {c.detail}</span>
    </span>
  );
}
