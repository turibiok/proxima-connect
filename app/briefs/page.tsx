import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { date, ilYa, periode } from '@/lib/format';
import { formaterFCFA, STATUTS_BRIEF, type StatutBrief } from '@/lib/clients/regles';
import { libelleCategorie } from '@/lib/referentiel';
import { PuceBrief } from '@/components/Statut';

export const metadata = { title: 'Briefs' };

export default async function Briefs({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await exiger('client:lire');
  const { statut: brut } = await searchParams;
  // par defaut, la file de travail : les briefs a traiter
  const statut = brut === 'tous' ? null : brut && brut in STATUTS_BRIEF ? (brut as StatutBrief) : 'recu';

  const [briefs, compte] = await Promise.all([
    requete<{
      id: string;
      objectif: string;
      categorie: string | null;
      type_mission: string | null;
      zone: string | null;
      nb_profils: number | null;
      date_debut: string | null;
      date_fin: string | null;
      budget_fcfa: number | null;
      statut: StatutBrief;
      recu_le: Date;
      client_id: string;
      raison_sociale: string;
    }>(
      `SELECT b.id, b.objectif, b.categorie, b.type_mission, b.zone, b.nb_profils, b.date_debut, b.date_fin,
              b.budget_fcfa, b.statut, b.recu_le, c.id AS client_id, c.raison_sociale
         FROM brief b JOIN client c ON c.id = b.client_id
        ${statut ? 'WHERE b.statut = $1' : ''}
        ORDER BY ${statut === 'recu' ? 'b.date_debut NULLS LAST, b.recu_le' : 'b.recu_le DESC'}
        LIMIT 200`,
      statut ? [statut] : [],
    ),
    requete<{ statut: StatutBrief; n: number }>('SELECT statut, count(*)::int AS n FROM brief GROUP BY statut'),
  ]);
  const n = (s: string) => compte.find((x) => x.statut === s)?.n ?? 0;
  const onglets: [string, string, number][] = [
    ['recu', STATUTS_BRIEF.recu.libelle, n('recu')],
    ['converti', 'Convertis', n('converti')],
    ['abandonne', 'Abandonnés', n('abandonne')],
    ['tous', 'Tous', compte.reduce((t, x) => t + x.n, 0)],
  ];
  const actif = statut ?? 'tous';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Briefs clients</h1>
        <p className="text-sm text-encre-douce">
          Les demandes des clients. Un brief à traiter devient une mission (module 5.3) ou est abandonné avec un motif.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {onglets.map(([code, libelle, total]) => (
          <Link
            key={code}
            href={code === 'recu' ? '/briefs' : `/briefs?statut=${code}`}
            className={`rounded-full border px-3 py-1 ${actif === code ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
          >
            {libelle} <span className="text-encre-douce">{total}</span>
          </Link>
        ))}
      </div>

      {briefs.length === 0 ? (
        <div className="carte p-10 text-center text-encre-douce">
          {statut === 'recu' ? (
            <>
              Aucun brief à traiter. Un nouveau brief se saisit depuis la{' '}
              <Link href="/clients" className="text-marque hover:underline">fiche du client</Link>.
            </>
          ) : (
            'Aucun brief.'
          )}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {briefs.map((b) => (
            <li key={b.id} className="carte flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/briefs/${b.id}`} className="font-semibold text-marque-fonce hover:underline">
                    {b.type_mission ?? (b.categorie ? libelleCategorie(b.categorie) : 'Brief')}
                  </Link>
                  <div className="text-sm">
                    <Link href={`/clients/${b.client_id}`} className="text-encre-douce hover:underline">{b.raison_sociale}</Link>
                  </div>
                </div>
                <PuceBrief statut={b.statut} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{b.objectif}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-encre-douce">
                <dt className="sr-only">Période</dt>
                <dd>{periode(b.date_debut, b.date_fin)}</dd>
                <dt className="sr-only">Zone</dt>
                <dd className="truncate">{b.zone ?? 'Zone à préciser'}</dd>
                <dt className="sr-only">Effectif</dt>
                <dd>{b.nb_profils ? `${b.nb_profils} personne${b.nb_profils > 1 ? 's' : ''}` : 'Effectif à préciser'}</dd>
                <dt className="sr-only">Budget</dt>
                <dd>{b.budget_fcfa !== null ? formaterFCFA(b.budget_fcfa) : 'Budget à préciser'}</dd>
              </dl>
              <p className="mt-auto pt-3 text-xs text-encre-douce">Reçu {ilYa(b.recu_le)} ({date(b.recu_le)})</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
