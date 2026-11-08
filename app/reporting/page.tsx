import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { date } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import { aujourdhuiBenin } from '@/lib/finances/regles';
import { CIBLE_SATISFACTION, NOTES_SATISFACTION, rentabilite, SEUIL_SATISFAIT, tauxSatisfaction } from '@/lib/reporting/regles';
import { JEUX } from '@/lib/reporting/exports';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';

export const metadata = { title: 'Reporting' };

interface LigneMission {
  id: string;
  reference: string;
  titre: string;
  statut: StatutMission;
  client_id: string;
  raison_sociale: string;
  budget_fcfa: number | null;
  facture: number;
  encaisse: number;
  cout: number;
}

export default async function Reporting({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const ctx = await exiger('tableau:lire');
  const anneeCourante = Number(aujourdhuiBenin().slice(0, 4));
  const { annee: saisie } = await searchParams;
  const annee = saisie === 'toutes' ? null : /^\d{4}$/.test(saisie ?? '') ? Number(saisie) : anneeCourante;
  const finances = ctx.peut('finance:lire');
  // annee de la mission : celle de son debut, a defaut celle de sa creation
  const filtreAnnee = `($1::int IS NULL OR extract(year FROM coalesce(m.date_debut, m.cree_le::date))::int = $1)`;

  const [avis, missions] = await Promise.all([
    requete<{ id: string; reference: string; titre: string; raison_sociale: string; satisfaction_note: number; satisfaction_commentaire: string | null; satisfaction_le: Date }>(
      `SELECT m.id, m.reference, m.titre, c.raison_sociale, m.satisfaction_note, m.satisfaction_commentaire, m.satisfaction_le
         FROM mission m JOIN client c ON c.id = m.client_id
        WHERE m.satisfaction_note IS NOT NULL AND ${filtreAnnee}
        ORDER BY m.satisfaction_le DESC`,
      [annee],
    ),
    finances
      ? requete<LigneMission>(
          `SELECT * FROM (
             SELECT m.id, m.reference, m.titre, m.statut, c.id AS client_id, c.raison_sociale, m.budget_fcfa,
                    (SELECT coalesce(sum(f.montant_fcfa), 0) FROM facture f WHERE f.mission_id = m.id AND f.statut <> 'annulee' AND f.type <> 'devis')::bigint AS facture,
                    (SELECT coalesce(sum(f.montant_regle_fcfa), 0) FROM facture f WHERE f.mission_id = m.id AND f.statut <> 'annulee')::bigint AS encaisse,
                    (SELECT coalesce(sum(p.montant_fcfa), 0) FROM paiement_intervenant p WHERE p.mission_id = m.id)::bigint AS cout
               FROM mission m JOIN client c ON c.id = m.client_id
              WHERE ${filtreAnnee}
           ) x WHERE facture > 0 OR cout > 0
           ORDER BY reference DESC`,
          [annee],
        )
      : [],
  ]);

  const taux = tauxSatisfaction(avis.map((a) => a.satisfaction_note));
  const parClient = new Map<string, { id: string; nom: string; missions: number; facture: number; encaisse: number; cout: number }>();
  for (const m of missions) {
    const c = parClient.get(m.client_id) ?? { id: m.client_id, nom: m.raison_sociale, missions: 0, facture: 0, encaisse: 0, cout: 0 };
    c.missions++;
    c.facture += m.facture;
    c.encaisse += m.encaisse;
    c.cout += m.cout;
    parClient.set(m.client_id, c);
  }
  const clients = [...parClient.values()].sort((a, b) => b.facture - a.facture);
  const total = rentabilite(missions.reduce((t, m) => t + m.facture, 0), missions.reduce((t, m) => t + m.cout, 0));
  const jeux = Object.entries(JEUX).filter(([, j]) => ctx.peut(j.droit));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reporting</h1>
          <p className="text-sm text-encre-douce">Satisfaction des clients, rentabilité des missions et exports pour analyse.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[anneeCourante, anneeCourante - 1, null].map((a) => (
            <Link
              key={a ?? 'toutes'}
              href={`/reporting?annee=${a ?? 'toutes'}`}
              className={`rounded-full border px-3 py-1 ${annee === a ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
            >
              {a ?? 'Toutes les années'}
            </Link>
          ))}
        </div>
      </div>

      <section className="carte p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Satisfaction des clients</h2>
          <span className={`text-sm ${taux === null ? 'text-encre-douce' : taux >= CIBLE_SATISFACTION ? 'text-ok' : 'text-danger'}`}>
            {taux === null ? 'Aucun avis' : `${Math.round(taux * 100)} % satisfaits`} · cible {Math.round(CIBLE_SATISFACTION * 100)} %
          </span>
        </div>
        <p className="mb-3 text-xs text-encre-douce">
          Un avis est recueilli auprès du client après la remise du rapport de chaque mission ; il est compté satisfait à partir de {SEUIL_SATISFAIT} sur 5.
        </p>
        {avis.length === 0 ? (
          <p className="text-sm text-encre-douce">Aucun avis recueilli sur la période.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {avis.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="min-w-0">
                  <Link href={`/missions/${a.id}/rapport`} className="font-mono text-xs text-marque hover:underline">{a.reference}</Link>{' '}
                  {a.raison_sociale}
                  {a.satisfaction_commentaire && <span className="block text-xs text-encre-douce">« {a.satisfaction_commentaire} »</span>}
                </span>
                <span className={`font-semibold ${a.satisfaction_note >= SEUIL_SATISFAIT ? 'text-ok' : 'text-danger'}`}>
                  {a.satisfaction_note}/5 <span className="font-normal text-encre-douce">· {NOTES_SATISFACTION[a.satisfaction_note]} · {date(a.satisfaction_le)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {finances && (
        <section className="carte p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">Rentabilité par client</h2>
            <span className="text-sm">
              Marge : <strong className={total.marge < 0 ? 'text-danger' : ''}>{formaterFCFA(total.marge)}</strong>
              {total.taux !== null && ` (${Math.round(total.taux * 100)} %)`}
            </span>
          </div>
          <p className="mb-3 text-xs text-encre-douce">
            Facturé (factures et acomptes non annulés) moins le coût des intervenants (paiements dus ou versés). Missions de la période ayant donné lieu à une facture ou à un paiement ; les factures hors mission n’y figurent pas.
          </p>
          {clients.length === 0 ? (
            <p className="text-sm text-encre-douce">Rien à afficher sur la période.</p>
          ) : (
            <Tableau
              entetes={['Client', 'Missions', 'Facturé', 'Encaissé', 'Coût intervenants', 'Marge']}
              lignes={clients.map((c) => {
                const r = rentabilite(c.facture, c.cout);
                return {
                  cle: c.id,
                  cellules: [
                    <Link key="n" href={`/clients/${c.id}`} className="text-marque-fonce hover:underline">{c.nom}</Link>,
                    String(c.missions),
                    formaterFCFA(c.facture),
                    formaterFCFA(c.encaisse),
                    formaterFCFA(c.cout),
                    <Marge key="m" marge={r.marge} taux={r.taux} />,
                  ],
                };
              })}
            />
          )}

          <h2 className="mb-3 mt-6 font-bold">Rentabilité par mission</h2>
          {missions.length === 0 ? (
            <p className="text-sm text-encre-douce">Rien à afficher sur la période.</p>
          ) : (
            <Tableau
              entetes={['Mission', 'Étape', 'Budget', 'Facturé', 'Coût intervenants', 'Marge']}
              lignes={missions.map((m) => {
                const r = rentabilite(m.facture, m.cout);
                return {
                  cle: m.id,
                  cellules: [
                    <span key="n">
                      <Link href={`/missions/${m.id}`} className="font-mono text-xs text-marque hover:underline">{m.reference}</Link> {m.titre}
                      <span className="block text-xs text-encre-douce">{m.raison_sociale}</span>
                    </span>,
                    LIBELLES_STATUT_MISSION[m.statut],
                    formaterFCFA(m.budget_fcfa),
                    m.facture ? formaterFCFA(m.facture) : <span key="f" className="text-alerte">Non facturé</span>,
                    formaterFCFA(m.cout),
                    <Marge key="m" marge={r.marge} taux={r.taux} />,
                  ],
                };
              })}
            />
          )}
        </section>
      )}

      <section className="carte p-5">
        <h2 className="font-bold">Exporter les données</h2>
        <p className="mb-3 text-xs text-encre-douce">
          Fichiers CSV qui s’ouvrent directement dans Excel. Chaque export est inscrit au journal. Les exports ne contiennent ni téléphone, ni pièce d’identité, ni compte de paiement des intervenants.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {jeux.map(([code, j]) => (
            <li key={code} className="flex items-start justify-between gap-3 rounded-lg border border-trait p-3">
              <div>
                <div className="font-medium">{j.libelle}</div>
                <p className="text-xs text-encre-douce">{j.description}</p>
              </div>
              <a href={`/reporting/export/${code}`} className="btn shrink-0 px-3 py-1.5 text-sm" download>CSV</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Marge({ marge, taux }: { marge: number; taux: number | null }) {
  return (
    <span className={`font-semibold ${marge < 0 ? 'text-danger' : ''}`}>
      {formaterFCFA(marge)}
      {taux !== null && <span className="font-normal text-encre-douce"> ({Math.round(taux * 100)} %)</span>}
    </span>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: { cle: string; cellules: React.ReactNode[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-trait text-left text-xs uppercase tracking-wide text-encre-douce">
          <tr>{entetes.map((e, i) => <th key={e} className={`py-2 pr-3 ${i > 1 ? 'text-right' : ''}`}>{e}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-trait">
          {lignes.map((l) => (
            <tr key={l.cle}>
              {l.cellules.map((c, i) => <td key={i} className={`py-2 pr-3 ${i > 1 ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
