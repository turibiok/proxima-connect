import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { pourcentage } from '@/lib/format';
import { ajouterJours, aujourdhuiBenin } from '@/lib/finances/regles';
import { CATEGORIES_MISSIONS, libelleCategorie } from '@/lib/referentiel';
import { serieMensuelle } from '@/lib/observatoire/regles';
import { SEUIL_SATISFAIT } from '@/lib/reporting/regles';
import { BarresMensuelles, CarteReleves } from '@/components/Observatoire';

export const metadata = { title: 'Observatoire terrain' };

const UUID = /^[0-9a-f-]{36}$/i;

interface Agregat {
  cle: string | null;
  missions: number;
  points: number;
  validees: number;
  rejetees: number;
  pointes: number;
  presents: number;
}

/**
 * Observatoire terrain (phase 6 : services d'analyse et de connaissance
 * terrain) : ce que les missions ont permis de relever et de verifier, ou,
 * quand, avec quelle fiabilite. Base des services d'analyse que PROXIMA
 * pourra proposer a ses clients.
 */
export default async function Observatoire({ searchParams }: { searchParams: Promise<{ periode?: string; categorie?: string; client?: string; carte?: string }> }) {
  await exiger('mission:lire');
  const sp = await searchParams;
  const jour = aujourdhuiBenin();
  const toutes = sp.periode === 'tout';
  const depuis = toutes ? null : ajouterJours(jour, -365);
  const categorie = CATEGORIES_MISSIONS.some((c) => c.code === sp.categorie) ? sp.categorie! : null;
  const client = sp.client && UUID.test(sp.client) ? sp.client : null;
  const zoom = sp.carte !== 'benin';
  const p = [depuis, categorie, client];
  // missions retenues par les filtres (annulees exclues)
  const filtre = `m.statut <> 'annulee'
    AND ($1::date IS NULL OR coalesce(m.date_debut, m.cree_le::date) >= $1)
    AND ($2::text IS NULL OR m.categorie = $2)
    AND ($3::uuid IS NULL OR m.client_id = $3)`;
  const realisee = `m.statut IN ('preuves_collectees', 'controlee', 'rapport_transmis', 'payee')`;
  const agregat = (cle: string) => `
    SELECT ${cle} AS cle,
           count(DISTINCT m.id) FILTER (WHERE ${realisee})::int AS missions,
           (SELECT count(*) FROM preuve x JOIN mission y ON y.id = x.mission_id
             WHERE x.statut = 'validee' AND x.latitude IS NOT NULL AND ${filtre.replace(/\bm\./g, 'y.')} AND ${cle.replace(/\bm\./g, 'y.')} IS NOT DISTINCT FROM ${cle})::int AS points,
           (SELECT count(*) FROM preuve x JOIN mission y ON y.id = x.mission_id
             WHERE x.statut = 'validee' AND ${filtre.replace(/\bm\./g, 'y.')} AND ${cle.replace(/\bm\./g, 'y.')} IS NOT DISTINCT FROM ${cle})::int AS validees,
           (SELECT count(*) FROM preuve x JOIN mission y ON y.id = x.mission_id
             WHERE x.statut = 'rejetee' AND ${filtre.replace(/\bm\./g, 'y.')} AND ${cle.replace(/\bm\./g, 'y.')} IS NOT DISTINCT FROM ${cle})::int AS rejetees,
           (SELECT count(*) FROM affectation a JOIN mission y ON y.id = a.mission_id
             WHERE a.role = 'titulaire' AND a.presence IS NOT NULL AND ${filtre.replace(/\bm\./g, 'y.')} AND ${cle.replace(/\bm\./g, 'y.')} IS NOT DISTINCT FROM ${cle})::int AS pointes,
           (SELECT count(*) FROM affectation a JOIN mission y ON y.id = a.mission_id
             WHERE a.role = 'titulaire' AND a.presence IN ('present', 'retard') AND ${filtre.replace(/\bm\./g, 'y.')} AND ${cle.replace(/\bm\./g, 'y.')} IS NOT DISTINCT FROM ${cle})::int AS presents
      FROM mission m WHERE ${filtre}
     GROUP BY ${cle} ORDER BY missions DESC`;

  const [points, chiffres, missionsDates, parCategorie, parDepartement, clients] = await Promise.all([
    requete<{ lat: number; lon: number; type: string; reference: string; commune: string | null; quand: Date }>(
      `SELECT x.latitude AS lat, x.longitude AS lon, x.type, m.reference, m.commune, coalesce(x.realisee_le, x.saisie_le) AS quand
         FROM preuve x JOIN mission m ON m.id = x.mission_id
        WHERE x.statut = 'validee' AND x.latitude IS NOT NULL AND x.longitude IS NOT NULL AND ${filtre}
        LIMIT 5000`,
      p,
    ),
    une<{ missions: number; communes: number; lignes: number; contre_appels: number; confirmes: number; avis: number; satisfaits: number }>(
      `SELECT count(*) FILTER (WHERE ${realisee})::int AS missions,
              count(DISTINCT m.commune) FILTER (WHERE ${realisee})::int AS communes,
              coalesce((SELECT sum((x.donnees->>'lignes')::int) FROM preuve x JOIN mission y ON y.id = x.mission_id
                         WHERE x.statut = 'validee' AND x.type = 'formulaire' AND x.donnees ? 'lignes' AND ${filtre.replace(/\bm\./g, 'y.')}), 0)::int AS lignes,
              (SELECT count(*) FROM preuve x JOIN mission y ON y.id = x.mission_id
                WHERE x.statut = 'validee' AND x.type = 'contre_appel' AND ${filtre.replace(/\bm\./g, 'y.')})::int AS contre_appels,
              (SELECT count(*) FROM preuve x JOIN mission y ON y.id = x.mission_id
                WHERE x.statut = 'validee' AND x.type = 'contre_appel' AND x.donnees->>'resultat' = 'confirme' AND ${filtre.replace(/\bm\./g, 'y.')})::int AS confirmes,
              count(*) FILTER (WHERE m.satisfaction_note IS NOT NULL)::int AS avis,
              count(*) FILTER (WHERE m.satisfaction_note >= ${SEUIL_SATISFAIT})::int AS satisfaits
         FROM mission m WHERE ${filtre}`,
      p,
    ),
    requete<{ quand: string }>(`SELECT coalesce(m.date_debut, m.cree_le::date)::text AS quand FROM mission m WHERE ${filtre} AND ${realisee}`, p),
    requete<Agregat>(agregat('m.categorie'), p),
    requete<Agregat>(agregat('m.departement'), p),
    requete<{ id: string; raison_sociale: string }>('SELECT id, raison_sociale FROM client ORDER BY lower(raison_sociale)'),
  ]);

  const c = chiffres!;
  const tot = (k: keyof Agregat) => parCategorie.reduce((t, a) => t + Number(a[k]), 0);
  const rejet = tot('validees') + tot('rejetees') ? tot('rejetees') / (tot('validees') + tot('rejetees')) : null;
  const presence = tot('pointes') ? tot('presents') / tot('pointes') : null;
  const moisCourant = jour.slice(0, 7);
  const lienExport = '/reporting/export/geopoints';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Observatoire terrain</h1>
        <p className="text-sm text-encre-douce">
          Ce que les missions ont permis de relever et de vérifier : où, quand, avec quelle fiabilité. Seules les preuves validées par PROXIMA comptent.
        </p>
      </div>

      {/* filtres : une ligne, au-dessus des graphiques */}
      <form className="carte flex flex-wrap items-end gap-2 p-3 text-sm">
        <select name="periode" defaultValue={toutes ? 'tout' : '12m'} aria-label="Période" className="champ w-auto">
          <option value="12m">12 derniers mois</option>
          <option value="tout">Depuis le début</option>
        </select>
        <select name="categorie" defaultValue={categorie ?? ''} aria-label="Type de mission" className="champ w-auto">
          <option value="">Tous les types de mission</option>
          {CATEGORIES_MISSIONS.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
        </select>
        <select name="client" defaultValue={client ?? ''} aria-label="Client" className="champ w-auto">
          <option value="">Tous les clients</option>
          {clients.map((x) => <option key={x.id} value={x.id}>{x.raison_sociale}</option>)}
        </select>
        <input type="hidden" name="carte" value={zoom ? 'releves' : 'benin'} />
        <button className="btn">Appliquer</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Missions réalisées" valeur={String(c.missions)} detail={`${c.communes} commune${c.communes > 1 ? 's' : ''} couverte${c.communes > 1 ? 's' : ''}`} />
        <Chiffre libelle="Points relevés" valeur={String(points.length)} detail={`${c.lignes} ligne${c.lignes > 1 ? 's' : ''} de données importées`} />
        <Chiffre libelle="Données rejetées" valeur={rejet === null ? '-' : pourcentage(rejet)} detail={c.contre_appels ? `${c.confirmes} contre-appel(s) confirmé(s) sur ${c.contre_appels}` : 'aucun contre-appel'} />
        <Chiffre
          libelle="Présence et satisfaction"
          valeur={presence === null ? '-' : pourcentage(presence, 0)}
          detail={c.avis ? `présence · ${pourcentage(c.satisfaits / c.avis, 0)} de clients satisfaits` : 'présence · aucun avis client'}
        />
      </div>

      <section className="carte space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Carte des relevés</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {(['releves', 'benin'] as const).map((v) => {
              const q = new URLSearchParams({ ...(toutes ? { periode: 'tout' } : {}), ...(categorie ? { categorie } : {}), ...(client ? { client } : {}), carte: v });
              return (
                <a key={v} href={`?${q}`} className={`rounded-full border px-2.5 py-0.5 ${(v === 'releves') === zoom ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
                  {v === 'releves' ? 'Zone des relevés' : 'Bénin entier'}
                </a>
              );
            })}
            <a href={lienExport} className="btn px-2.5 py-0.5 text-xs" download>Exporter les points (CSV)</a>
          </div>
        </div>
        {points.length === 0 ? (
          <p className="text-sm text-encre-douce">Aucun point relevé sur la période : les géopoints validés des missions apparaîtront ici.</p>
        ) : (
          <CarteReleves
            zoom={zoom}
            points={points.map((x) => ({ lon: x.lon, lat: x.lat, libelle: `${x.reference}${x.commune ? ` · ${x.commune}` : ''} · ${x.type.replace('_', '-')}` }))}
          />
        )}
        <p className="text-xs text-encre-douce">Contour simplifié, à titre de repère. L’export CSV s’ouvre dans un logiciel de cartographie (QGIS) ou un tableur.</p>
      </section>

      <section className="carte grid gap-6 p-5 lg:grid-cols-2">
        <BarresMensuelles titre="Missions réalisées par mois" unite="missions" serie={serieMensuelle(missionsDates.map((x) => x.quand), moisCourant)} />
        <BarresMensuelles titre="Points relevés par mois" unite="points" serie={serieMensuelle(points.map((x) => x.quand), moisCourant)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tableau titre="Par type de mission" lignes={parCategorie} libelle={(k) => (k ? libelleCategorie(k) : '-')} />
        <Tableau titre="Par département" lignes={parDepartement} libelle={(k) => k ?? 'Non localisé'} />
      </div>
    </div>
  );
}

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: string; detail: string }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-encre-douce">{libelle}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valeur}</div>
      <div className="mt-1 text-xs text-encre-douce">{detail}</div>
    </div>
  );
}

function Tableau({ titre, lignes, libelle }: { titre: string; lignes: Agregat[]; libelle: (cle: string | null) => string }) {
  return (
    <section className="carte p-5">
      <h2 className="mb-2 font-bold">{titre}</h2>
      {lignes.length === 0 ? (
        <p className="text-sm text-encre-douce">Aucune mission sur la période.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-encre-douce">
            <tr>
              <th className="pb-2"></th>
              <th className="pb-2 text-right">Missions</th>
              <th className="pb-2 text-right">Points</th>
              <th className="pb-2 text-right">Rejet</th>
              <th className="pb-2 text-right">Présence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-trait">
            {lignes.map((l) => (
              <tr key={l.cle ?? 'aucun'}>
                <td className="py-1.5 pr-2">{libelle(l.cle)}</td>
                <td className="py-1.5 text-right tabular-nums">{l.missions}</td>
                <td className="py-1.5 text-right tabular-nums">{l.points}</td>
                <td className="py-1.5 text-right tabular-nums">{l.validees + l.rejetees ? pourcentage(l.rejetees / (l.validees + l.rejetees)) : '-'}</td>
                <td className="py-1.5 text-right tabular-nums">{l.pointes ? pourcentage(l.presents / l.pointes, 0) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
