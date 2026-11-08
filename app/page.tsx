import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { pourcentage } from '@/lib/format';
import { requete, une } from '@/lib/db';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { CATEGORIES_MISSIONS } from '@/lib/referentiel';
import { formaterFCFA } from '@/lib/clients/regles';
import { aujourdhuiBenin, DELAI_PAIEMENT, libelleDuree, RETARD_IMPORTANT_JOURS } from '@/lib/finances/regles';
import { facturesEnRetard, syntheseFactures, synthesePaiements } from '@/lib/finances/donnees';
import { CIBLE_SATISFACTION, SEUIL_SATISFAIT } from '@/lib/reporting/regles';
import { quand } from '@/lib/communication/regles';

export const metadata = { title: 'Tableau de bord' };

export default async function TableauDeBord() {
  const ctx = await exiger('tableau:lire');
  const finances = ctx.peut('finance:lire');
  const jour = aujourdhuiBenin();

  const [chiffres, aVerifier, villes, categories, paie, tresoreries, retards, rappels] = await Promise.all([
    une<{ inscrits: number; verifies: number; actifs: number; en_attente: number; semaine: number; clients: number; prospects: number; briefs: number; missions: number; en_cours: number; presence: number | null; rejet: number | null; incidents: number; satisfaits: number; avis: number }>(
      `SELECT count(*)::int AS inscrits,
              count(*) FILTER (WHERE statut IN ('verifie', 'actif'))::int AS verifies,
              count(*) FILTER (WHERE statut = 'actif')::int AS actifs,
              count(*) FILTER (WHERE statut = 'en_attente')::int AS en_attente,
              count(*) FILTER (WHERE cree_le > now() - interval '7 days')::int AS semaine,
              (SELECT count(*) FROM client WHERE statut_commercial IN ('actif', 'recurrent'))::int AS clients,
              (SELECT count(*) FROM client WHERE statut_commercial IN ('prospect', 'pilote'))::int AS prospects,
              (SELECT count(*) FROM brief WHERE statut = 'recu')::int AS briefs,
              (SELECT count(*) FROM mission WHERE statut IN ('preuves_collectees', 'controlee', 'rapport_transmis', 'payee'))::int AS missions,
              (SELECT count(*) FROM mission WHERE statut IN ('selection', 'preparation', 'execution'))::int AS en_cours,
              (SELECT avg((presence <> 'absent')::int)::float FROM affectation WHERE presence IS NOT NULL AND role = 'titulaire') AS presence,
              (SELECT (count(*) FILTER (WHERE statut = 'rejetee'))::float / nullif(count(*) FILTER (WHERE statut <> 'en_attente'), 0) FROM preuve) AS rejet,
              (SELECT count(*) FROM incident WHERE resolu_le IS NULL)::int AS incidents,
              (SELECT count(*) FROM mission WHERE satisfaction_note >= $1)::int AS satisfaits,
              (SELECT count(*) FROM mission WHERE satisfaction_note IS NOT NULL)::int AS avis
         FROM intervenant`,
      [SEUIL_SATISFAIT],
    ),
    requete<{ id: string; nom: string; prenoms: string; telephone: string; ville: string; cree_le: Date }>(
      `SELECT id, nom, prenoms, telephone, ville, cree_le FROM intervenant
        WHERE statut = 'en_attente' ORDER BY cree_le LIMIT 8`,
    ),
    requete<{ ville: string; n: number }>(
      `SELECT initcap(ville) AS ville, count(*)::int AS n FROM intervenant
        WHERE statut NOT IN ('inactif') GROUP BY initcap(ville) ORDER BY n DESC LIMIT 8`,
    ),
    requete<{ code: string; n: number }>(
      `SELECT c AS code, count(*)::int AS n FROM intervenant, unnest(categories_missions) c
        WHERE statut NOT IN ('inactif') GROUP BY c`,
    ),
    finances ? synthesePaiements() : null,
    finances ? syntheseFactures(jour) : [],
    finances ? facturesEnRetard(jour, 100) : [],
    // module 5.8 : rappels a envoyer la veille ou le jour du demarrage
    ctx.peut('mission:modifier')
      ? requete<{ id: string; reference: string; titre: string; date_debut: string; a_rappeler: number }>(
          `SELECT m.id, m.reference, m.titre, m.date_debut, count(*)::int AS a_rappeler
             FROM mission m
             JOIN affectation a ON a.mission_id = m.id AND a.role = 'titulaire' AND a.reponse = 'accepte'
                               AND NOT EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id)
            WHERE m.statut IN ('preparation', 'execution') AND m.date_debut BETWEEN $1::date AND $1::date + 1
              AND NOT EXISTS (SELECT 1 FROM communication c WHERE c.mission_id = m.id AND c.intervenant_id = a.intervenant_id AND c.modele = 'rappel')
            GROUP BY m.id ORDER BY m.date_debut`,
          [jour],
        )
      : [],
  ]);
  const echu = tresoreries.reduce((t, x) => t + x.echu, 0);
  const c = chiffres!;
  const maxVille = Math.max(1, ...villes.map((v) => v.n));
  const maxCat = Math.max(1, ...categories.map((v) => v.n));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>

      {/* cibles a 12 mois : cahier des charges, section 11 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur libelle="Profils inscrits" valeur={c.inscrits} cible="300 à 500" detail={`+${c.semaine} cette semaine`} />
        <Indicateur libelle="Profils vérifiés" valeur={c.verifies} cible="100 à 150" detail={`${c.actifs} actifs`} />
        <Indicateur libelle="Missions réalisées" valeur={c.missions} cible="100" detail={`${c.en_cours} en cours · ${c.briefs} brief(s) à traiter`} />
        <Indicateur libelle="Clients actifs" valeur={c.clients} cible="10 à 15" detail={`${c.prospects} prospect(s) ou pilote(s)`} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur libelle="Taux de présence" valeur={c.presence === null ? "-" : `${Math.round(c.presence * 100)} %`} cible="95 % et plus" detail="titulaires pointés" />
        <Indicateur libelle="Données rejetées" valeur={c.rejet === null ? "-" : pourcentage(c.rejet)} cible="moins de 5 %" detail={`${c.incidents} incident(s) ouvert(s)`} />
        <Indicateur
          libelle="Satisfaction clients"
          valeur={c.avis ? `${Math.round((c.satisfaits / c.avis) * 100)} %` : '-'}
          cible={`${Math.round(CIBLE_SATISFACTION * 100)} % et plus`}
          detail={`${c.avis} avis recueilli${c.avis > 1 ? 's' : ''} (${SEUIL_SATISFAIT} ou 5 sur 5)`}
          lien="/reporting"
          alerte={c.avis > 0 && c.satisfaits / c.avis < CIBLE_SATISFACTION}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {paie && (
          <Indicateur
            libelle="Paiement des intervenants"
            valeur={paie.delai_median === null ? '-' : libelleDuree(Math.round(paie.delai_median))}
            cible={`${DELAI_PAIEMENT.cible} à ${DELAI_PAIEMENT.limite} h`}
            detail={`délai médian · ${paie.a_payer} à verser${paie.en_retard ? `, dont ${paie.en_retard} en retard` : ''}`}
            lien="/finances/paiements"
            alerte={paie.en_retard > 0}
          />
        )}
        {finances && (
          <Indicateur
            libelle="Factures échues"
            valeur={formaterFCFA(echu)}
            cible="aucun retard important"
            detail={`${retards.length} en retard de plus de ${RETARD_IMPORTANT_JOURS} jours`}
            lien="/finances/factures?filtre=echues"
            alerte={retards.length > 0}
          />
        )}
      </div>

      {rappels.length > 0 && (
        <section role="alert" className="rounded-xl border border-alerte/30 bg-alerte-pale px-4 py-3 text-sm text-alerte">
          <strong>Rappels à envoyer</strong> :{' '}
          {rappels.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ' · '}
              <Link href={`/missions/${r.id}`} className="font-medium underline">{r.reference}</Link> ({r.a_rappeler} intervenant{r.a_rappeler > 1 ? 's' : ''}, {quand(r.date_debut, jour)})
            </span>
          ))}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="carte p-5 lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Profils à vérifier</h2>
            <Link href="/intervenants?statut=en_attente" className="text-sm text-marque hover:underline">
              Tous ({c.en_attente}) →
            </Link>
          </div>
          {aVerifier.length === 0 ? (
            <p className="text-sm text-encre-douce">Aucun profil en attente.</p>
          ) : (
            <ul className="divide-y divide-trait text-sm">
              {aVerifier.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/intervenants/${p.id}`} className="font-medium text-marque-fonce hover:underline">
                    {p.nom} {p.prenoms}
                  </Link>
                  <span className="text-right text-xs text-encre-douce">
                    {afficherTelephone(p.telephone)} · {p.ville}
                    <br />
                    inscrit il y a {jours(p.cree_le)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="carte p-5">
          <h2 className="mb-3 font-bold">Vivier par ville</h2>
          <Barres donnees={villes.map((v) => ({ libelle: v.ville, n: v.n }))} max={maxVille} />
        </section>
      </div>

      <section className="carte p-5">
        <h2 className="mb-3 font-bold">Profils disponibles par type de mission</h2>
        <Barres
          donnees={CATEGORIES_MISSIONS.map((cat) => ({ libelle: cat.libelle, n: categories.find((x) => x.code === cat.code)?.n ?? 0 }))}
          max={maxCat}
        />
      </section>
    </div>
  );
}

function jours(d: Date) {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return n === 0 ? 'moins d’un jour' : `${n} jour${n > 1 ? 's' : ''}`;
}

function Indicateur({ libelle, valeur, cible, detail, lien, alerte }: { libelle: string; valeur: number | string; cible: string; detail: string; lien?: string; alerte?: boolean }) {
  const contenu = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-encre-douce">{libelle}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${alerte ? 'text-danger' : ''}`}>{valeur}</div>
      <div className="mt-1 text-xs text-encre-douce">
        {detail} · cible 12 mois : {cible}
      </div>
    </>
  );
  return lien ? <Link href={lien} className="carte block p-4 hover:border-marque">{contenu}</Link> : <div className="carte p-4">{contenu}</div>;
}

function Barres({ donnees, max }: { donnees: { libelle: string; n: number }[]; max: number }) {
  if (donnees.length === 0) return <p className="text-sm text-encre-douce">Pas encore de données.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {donnees.map((d) => (
        <li key={d.libelle} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3">
          <span className="truncate">{d.libelle}</span>
          <span className="h-2.5 rounded-full bg-papier">
            <span className="block h-full rounded-full bg-marque" style={{ width: `${(d.n / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-encre-douce">{d.n}</span>
        </li>
      ))}
    </ul>
  );
}
