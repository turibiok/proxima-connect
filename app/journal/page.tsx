import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { LIBELLES_ACTIONS } from '@/lib/journal';

export const metadata = { title: 'Journal' };

export default async function Journal() {
  await exiger('journal:lire');
  const lignes = await requete<{
    id: number;
    action: string;
    entite: string;
    entite_id: string | null;
    details: Record<string, unknown> | null;
    ip: string | null;
    cree_le: Date;
    auteur: string | null;
  }>(
    `SELECT j.id, j.action, j.entite, j.entite_id, j.details, j.ip, j.cree_le, u.nom_complet AS auteur
       FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
      ORDER BY j.cree_le DESC LIMIT 200`,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Journal des accès et modifications</h1>
        <p className="text-sm text-encre-douce">Les 200 derniers événements. Le journal ne peut être ni modifié ni effacé depuis l’application.</p>
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Qui</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Objet</th>
              <th className="px-4 py-2.5">Adresse IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-trait">
            {lignes.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2 text-encre-douce">
                  {new Date(l.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' })}
                </td>
                <td className="px-4 py-2">{l.auteur ?? <span className="text-encre-douce">Public</span>}</td>
                <td className="px-4 py-2">{LIBELLES_ACTIONS[l.action] ?? l.action}</td>
                <td className="px-4 py-2">
                  {l.entite === 'intervenant' && l.entite_id ? (
                    <Link href={`/intervenants/${l.entite_id}`} className="text-marque hover:underline">
                      Intervenant {(l.details?.reference as string) ?? ''}
                    </Link>
                  ) : l.entite === 'client' && l.entite_id ? (
                    <Link href={`/clients/${l.entite_id}`} className="text-marque hover:underline">
                      {(l.details?.raison_sociale as string) ?? 'Client'}
                    </Link>
                  ) : l.entite === 'mission' && l.entite_id ? (
                    <Link href={`/missions/${l.entite_id}`} className="text-marque hover:underline">
                      Mission {(l.details?.reference as string) ?? ''}
                      {typeof l.details?.intervenant === 'string' && ` : ${l.details.intervenant}`}
                    </Link>
                  ) : l.entite === 'brief' && l.entite_id ? (
                    <Link href={`/briefs/${l.entite_id}`} className="text-marque hover:underline">
                      Brief{typeof l.details?.client === 'string' && ` de ${l.details.client}`}
                    </Link>
                  ) : (
                    <span className="text-encre-douce">
                      {l.entite}
                      {typeof l.details?.email === 'string' && ` (${l.details.email})`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-encre-douce">{l.ip ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
