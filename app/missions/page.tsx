import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { periode } from '@/lib/format';
import { ETAPES, type StatutMission } from '@/lib/missions/regles';
import { libelleCategorie } from '@/lib/referentiel';
import { PuceMission } from '@/components/Statut';

export const metadata = { title: 'Missions' };

const FILTRES: { code: string; libelle: string; statuts: StatutMission[] }[] = [
  { code: 'en_cours', libelle: 'En cours', statuts: ['brief_recu', 'selection', 'preparation', 'execution', 'preuves_collectees', 'controlee', 'rapport_transmis'] },
  { code: 'selection', libelle: 'Sélection', statuts: ['selection'] },
  { code: 'preparation', libelle: 'Préparation', statuts: ['preparation'] },
  { code: 'execution', libelle: 'Exécution', statuts: ['execution'] },
  { code: 'terminees', libelle: 'Terminées', statuts: ['payee'] },
  { code: 'annulees', libelle: 'Annulées', statuts: ['annulee'] },
];

export default async function Missions({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  const ctx = await exiger('mission:lire');
  const { filtre = 'en_cours' } = await searchParams;
  const actif = FILTRES.find((f) => f.code === filtre) ?? FILTRES[0];

  const [missions, comptes] = await Promise.all([
    requete<{
      id: string;
      reference: string;
      titre: string;
      categorie: string;
      zone: string | null;
      date_debut: string | null;
      date_fin: string | null;
      nb_profils_requis: number;
      statut: StatutMission;
      raison_sociale: string;
      client_id: string;
      engages: number;
      en_attente: number;
    }>(
      `SELECT m.id, m.reference, m.titre, m.categorie, m.zone, m.date_debut, m.date_fin, m.nb_profils_requis, m.statut,
              c.raison_sociale, c.id AS client_id,
              (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.role = 'titulaire' AND a.reponse = 'accepte'
                  AND NOT EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id))::int AS engages,
              (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.reponse = 'en_attente' AND a.proposee_le IS NOT NULL)::int AS en_attente
         FROM mission m JOIN client c ON c.id = m.client_id
        WHERE m.statut = ANY ($1)
        ORDER BY m.date_debut NULLS LAST, m.cree_le DESC
        LIMIT 200`,
      [actif.statuts],
    ),
    requete<{ statut: StatutMission; n: number }>('SELECT statut, count(*)::int AS n FROM mission GROUP BY statut'),
  ]);
  const total = (statuts: StatutMission[]) => comptes.filter((c) => statuts.includes(c.statut)).reduce((t, c) => t + c.n, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Missions</h1>
          <p className="text-sm text-encre-douce">Du brief au paiement : {ETAPES.map((e) => e.libelle.toLowerCase()).join(' → ')}.</p>
        </div>
        {ctx.peut('mission:modifier') && (
          <div className="flex gap-2">
            <Link href="/briefs" className="btn">Depuis un brief</Link>
            <Link href="/missions/nouvelle" className="btn-primaire">+ Nouvelle mission</Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {FILTRES.map((f) => (
          <Link
            key={f.code}
            href={`/missions?filtre=${f.code}`}
            className={`rounded-full border px-3 py-1 ${actif.code === f.code ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
          >
            {f.libelle} <span className="text-encre-douce">{total(f.statuts)}</span>
          </Link>
        ))}
      </div>

      {missions.length === 0 ? (
        <div className="carte p-10 text-center text-encre-douce">
          Aucune mission {actif.libelle.toLowerCase()}. Une mission se crée depuis un{' '}
          <Link href="/briefs" className="text-marque hover:underline">brief à traiter</Link>.
        </div>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Mission</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Quand, où</th>
                <th className="px-4 py-2.5">Équipe</th>
                <th className="px-4 py-2.5">Étape</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {missions.map((m) => {
                const complet = m.engages >= m.nb_profils_requis;
                return (
                  <tr key={m.id} className="hover:bg-papier/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/missions/${m.id}`} className="font-semibold text-marque-fonce hover:underline">{m.titre}</Link>
                      <div className="text-xs text-encre-douce"><span className="font-mono">{m.reference}</span> · {libelleCategorie(m.categorie)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${m.client_id}`} className="hover:underline">{m.raison_sociale}</Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {periode(m.date_debut, m.date_fin)}
                      <div className="truncate text-xs text-encre-douce">{m.zone ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      <span className={complet ? 'font-semibold text-ok' : ''}>{m.engages}</span> / {m.nb_profils_requis}
                      {m.en_attente > 0 && <div className="text-xs text-alerte">{m.en_attente} réponse{m.en_attente > 1 ? 's' : ''} attendue{m.en_attente > 1 ? 's' : ''}</div>}
                    </td>
                    <td className="px-4 py-2.5"><PuceMission statut={m.statut} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
