import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { clauseRecherche, lireFiltres } from '@/lib/intervenants/recherche';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { CATEGORIES_MISSIONS, JOURS, STATUTS_PROFIL, VILLES, libelleCategorie, type StatutProfil } from '@/lib/referentiel';
import { DEPARTEMENTS } from '@/lib/geographie';
import { PuceStatut } from '@/components/Statut';

export const metadata = { title: 'Intervenants' };

const PAR_PAGE = 50;

interface Ligne {
  id: string;
  reference: string;
  nom: string;
  prenoms: string;
  telephone: string;
  ville: string;
  quartier: string | null;
  departement: string | null;
  categories_missions: string[];
  jours_disponibles: string[];
  statut: StatutProfil;
  score: number | null;
  missions: number;
  cree_le: Date;
}

export default async function Intervenants({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exiger('profil:lire');
  const sp = await searchParams;
  const filtres = lireFiltres(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const { where, params } = clauseRecherche(filtres);

  const [lignes, [{ total }], parStatut] = await Promise.all([
    requete<Ligne>(
      `SELECT i.id, i.reference, i.nom, i.prenoms, i.telephone, i.ville, i.quartier, i.departement, i.categories_missions,
              i.jours_disponibles, i.statut, i.score, i.cree_le,
              (SELECT count(*) FROM affectation a WHERE a.intervenant_id = i.id AND a.presence IN ('present', 'retard'))::int AS missions
         FROM intervenant i ${where}
        ORDER BY i.cree_le DESC
        LIMIT ${PAR_PAGE} OFFSET ${(page - 1) * PAR_PAGE}`,
      params,
    ),
    requete<{ total: number }>(`SELECT count(*)::int AS total FROM intervenant i ${where}`, params),
    requete<{ statut: StatutProfil; n: number }>('SELECT statut, count(*)::int AS n FROM intervenant GROUP BY statut'),
  ]);

  const actifs = Object.keys(filtres).length > 0;
  const lien = (extra: Record<string, string>) => `/intervenants?${new URLSearchParams({ ...(filtres as Record<string, string>), ...extra })}`;
  const compte = (s: string) => parStatut.find((x) => x.statut === s)?.n ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Intervenants</h1>
          <p className="text-sm text-encre-douce">
            {total} profil{total > 1 ? 's' : ''} {actifs ? 'correspondant aux filtres' : 'dans la base'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inscription" target="_blank" className="btn">Formulaire public ↗</Link>
          {ctx.peut('profil:modifier') && <Link href="/intervenants/nouveau" className="btn-primaire">+ Saisir un profil</Link>}
        </div>
      </div>

      {/* raccourcis par statut */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/intervenants" className={`rounded-full border px-3 py-1 ${!filtres.statut ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
          Tous
        </Link>
        {(Object.keys(STATUTS_PROFIL) as StatutProfil[]).map((s) => (
          <Link
            key={s}
            href={`/intervenants?statut=${s}`}
            className={`rounded-full border px-3 py-1 ${filtres.statut === s ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
          >
            {STATUTS_PROFIL[s].libelle} <span className="text-encre-douce">{compte(s)}</span>
          </Link>
        ))}
      </div>

      {/* filtres : simple formulaire GET, fonctionne sans JavaScript */}
      <form className="carte grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={filtres.q} placeholder="Nom, téléphone, référence…" className="champ sm:col-span-2" />
        <input name="ville" list="villes" defaultValue={filtres.ville} placeholder="Ville" className="champ" />
        <select name="departement" defaultValue={filtres.departement ?? ''} aria-label="Département" className="champ">
          <option value="">Tous les départements</option>
          {DEPARTEMENTS.map((d) => <option key={d.nom} value={d.nom}>{d.nom}</option>)}
          <option value="inconnu">Ville non reconnue</option>
        </select>
        <datalist id="villes">{VILLES.map((v) => <option key={v} value={v} />)}</datalist>
        <input name="zone" defaultValue={filtres.zone} placeholder="Quartier / zone" className="champ" />
        <select name="categorie" defaultValue={filtres.categorie ?? ''} className="champ">
          <option value="">Toutes les missions</option>
          {CATEGORIES_MISSIONS.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
        </select>
        <select name="jour" defaultValue={filtres.jour ?? ''} className="champ">
          <option value="">Tous les jours</option>
          {JOURS.map((j) => <option key={j.code} value={j.code}>Disponible le {j.libelle.toLowerCase()}</option>)}
        </select>
        <input name="competence" defaultValue={filtres.competence} placeholder="Compétence" className="champ" />
        <input name="score_min" type="number" min={0} max={100} defaultValue={filtres.score_min} placeholder="Score minimum" className="champ" />
        {filtres.statut && <input type="hidden" name="statut" value={filtres.statut} />}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn-primaire">Filtrer</button>
          {actifs && <Link href="/intervenants" className="btn">Effacer les filtres</Link>}
        </div>
      </form>

      {lignes.length === 0 ? (
        <div className="carte p-10 text-center text-encre-douce">
          {actifs ? 'Aucun profil ne correspond à ces critères.' : 'Aucun intervenant inscrit pour le moment.'}
        </div>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Intervenant</th>
                <th className="px-4 py-2.5">Téléphone</th>
                <th className="px-4 py-2.5">Localisation</th>
                <th className="px-4 py-2.5">Missions acceptées</th>
                <th className="px-4 py-2.5 text-right">Score</th>
                <th className="px-4 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {lignes.map((l) => (
                <tr key={l.id} className="hover:bg-papier/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/intervenants/${l.id}`} className="font-semibold text-marque-fonce hover:underline">
                      {l.nom} {l.prenoms}
                    </Link>
                    <div className="font-mono text-xs text-encre-douce">{l.reference}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{afficherTelephone(l.telephone)}</td>
                  <td className="px-4 py-2.5">
                    {l.ville}
                    {l.quartier && <span className="text-encre-douce"> · {l.quartier}</span>}
                    <div className={`text-xs ${l.departement ? 'text-encre-douce' : 'text-alerte'}`}>{l.departement ?? 'ville non reconnue'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-encre-douce">
                    {l.categories_missions.map(libelleCategorie).join(', ')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.score === null ? <span className="text-encre-douce">-</span> : Math.round(l.score)}
                    <div className="text-xs text-encre-douce">{l.missions} mission{l.missions > 1 ? 's' : ''}</div>
                  </td>
                  <td className="px-4 py-2.5"><PuceStatut statut={l.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAR_PAGE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-encre-douce">
            Page {page} sur {Math.ceil(total / PAR_PAGE)}
          </span>
          <div className="flex gap-2">
            {page > 1 && <Link href={lien({ page: String(page - 1) })} className="btn">← Précédente</Link>}
            {page * PAR_PAGE < total && <Link href={lien({ page: String(page + 1) })} className="btn">Suivante →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
