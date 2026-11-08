import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { avancement, signauxTerritoire, STATUTS_TERRITOIRE, type StatutTerritoire } from '@/lib/territoires/regles';
import { ReglageTerritoire } from './Reglage';

export const metadata = { title: 'Territoires' };

interface Ligne {
  nom: string;
  chef_lieu: string;
  statut: StatutTerritoire;
  objectif_profils: number | null;
  note: string | null;
  inscrits: number;
  mobilisables: number;
  missions_12m: number;
  en_cours: number;
  besoin: number;
  clients: number;
}

/**
 * Couverture du territoire (phase 5 : extension geographique) : ou est le
 * vivier, ou est la demande, quels departements ouvrir ensuite.
 */
export default async function Territoires() {
  const ctx = await exiger('tableau:lire');
  const [lignes, inconnus] = await Promise.all([
    requete<Ligne>(
      `SELECT d.nom, d.chef_lieu, t.statut, t.objectif_profils, t.note,
              (SELECT count(*) FROM intervenant i WHERE i.departement = d.nom AND i.statut <> 'inactif')::int AS inscrits,
              (SELECT count(*) FROM intervenant i WHERE i.departement = d.nom AND i.statut IN ('verifie', 'actif'))::int AS mobilisables,
              (SELECT count(*) FROM mission m WHERE m.departement = d.nom AND m.statut <> 'annulee' AND m.cree_le > now() - interval '12 months')::int AS missions_12m,
              (SELECT count(*) FROM mission m WHERE m.departement = d.nom AND m.statut IN ('selection', 'preparation', 'execution'))::int AS en_cours,
              (SELECT coalesce(sum(m.nb_profils_requis), 0) FROM mission m WHERE m.departement = d.nom AND m.statut IN ('selection', 'preparation', 'execution'))::int AS besoin,
              (SELECT count(*) FROM client c WHERE c.departement = d.nom)::int AS clients
         FROM departement d JOIN territoire t ON t.departement = d.nom
        ORDER BY CASE t.statut WHEN 'ouvert' THEN 0 WHEN 'preparation' THEN 1 ELSE 2 END, d.nom`,
    ),
    une<{ profils: number; missions: number }>(
      `SELECT (SELECT count(*) FROM intervenant WHERE departement IS NULL AND statut <> 'inactif')::int AS profils,
              (SELECT count(*) FROM mission WHERE departement IS NULL AND statut <> 'annulee')::int AS missions`,
    ),
  ]);
  const gestion = ctx.peut('parametre:gerer');
  const total = (k: keyof Ligne) => lignes.reduce((t, l) => t + Number(l[k]), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Territoires</h1>
        <p className="text-sm text-encre-douce">
          Vivier et demande par département (12 départements, 77 communes). Chaque profil, client et mission est rattaché à sa commune
          d’après la ville ou la zone saisie.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Départements ouverts" valeur={String(lignes.filter((l) => l.statut === 'ouvert').length)} detail={`${lignes.filter((l) => l.statut === 'preparation').length} en préparation`} />
        <Chiffre libelle="Profils mobilisables" valeur={String(total('mobilisables'))} detail={`${total('inscrits')} inscrits localisés`} />
        <Chiffre libelle="Missions sur 12 mois" valeur={String(total('missions_12m'))} detail={`${total('en_cours')} en cours`} />
        <Chiffre
          libelle="Non localisés"
          valeur={String((inconnus?.profils ?? 0) + (inconnus?.missions ?? 0))}
          detail={`${inconnus?.profils ?? 0} profil(s), ${inconnus?.missions ?? 0} mission(s) : ville non reconnue`}
          lien={inconnus?.profils ? '/intervenants?departement=inconnu' : undefined}
        />
      </div>

      <div className="space-y-3">
        {lignes.map((l) => {
          const signaux = signauxTerritoire(l);
          const av = avancement(l.mobilisables, l.objectif_profils);
          return (
            <section key={l.nom} className={`carte p-4 ${l.statut === 'ferme' && !l.inscrits && !l.missions_12m ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">
                    {l.nom} <span className="text-xs font-normal text-encre-douce">chef-lieu {l.chef_lieu}</span>
                  </h2>
                  <p className="text-xs text-encre-douce">{STATUTS_TERRITOIRE[l.statut].libelle} · {STATUTS_TERRITOIRE[l.statut].aide}{l.note && ` · ${l.note}`}</p>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <Mesure k="Mobilisables" v={l.mobilisables} lien={`/intervenants?departement=${encodeURIComponent(l.nom)}`} />
                  <Mesure k="Inscrits" v={l.inscrits} />
                  <Mesure k="Missions 12 mois" v={l.missions_12m} lien={`/missions?filtre=en_cours&departement=${encodeURIComponent(l.nom)}`} />
                  <Mesure k="Clients" v={l.clients} />
                </div>
              </div>
              {av !== null && (
                <div className="mt-2 flex items-center gap-2 text-xs text-encre-douce">
                  <span className="h-2 flex-1 rounded-full bg-papier" aria-hidden>
                    <span className={`block h-full rounded-full ${av >= 1 ? 'bg-ok' : av >= 0.5 ? 'bg-accent' : 'bg-danger'}`} style={{ width: `${av * 100}%` }} />
                  </span>
                  <span>{l.mobilisables} / {l.objectif_profils} profils mobilisables visés</span>
                </div>
              )}
              {signaux.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {signaux.map((s) => (
                    <li key={s.message} className={s.niveau === 'danger' ? 'text-danger' : s.niveau === 'alerte' ? 'text-alerte' : 'text-ok'}>{s.message}</li>
                  ))}
                </ul>
              )}
              {gestion && <ReglageTerritoire departement={l.nom} statut={l.statut} objectif={l.objectif_profils} note={l.note} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Chiffre({ libelle, valeur, detail, lien }: { libelle: string; valeur: string; detail: string; lien?: string }) {
  const contenu = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-encre-douce">{libelle}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valeur}</div>
      <div className="mt-1 text-xs text-encre-douce">{detail}</div>
    </>
  );
  return lien ? <Link href={lien} className="carte block p-4 hover:border-marque">{contenu}</Link> : <div className="carte p-4">{contenu}</div>;
}

function Mesure({ k, v, lien }: { k: string; v: number; lien?: string }) {
  const corps = (
    <>
      <span className="block text-lg font-bold tabular-nums">{v}</span>
      <span className="text-xs text-encre-douce">{k}</span>
    </>
  );
  return lien && v > 0 ? <Link href={lien} className="text-center hover:text-marque">{corps}</Link> : <span className="text-center">{corps}</span>;
}
