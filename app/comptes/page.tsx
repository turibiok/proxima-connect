import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { ROLES, type Role } from '@/lib/auth/roles';
import { ActionsCompte, NouveauCompte } from './Formulaires';

export const metadata = { title: 'Comptes' };

export default async function Comptes() {
  const ctx = await exiger('compte:gerer');
  const comptes = await requete<{ id: string; email: string; nom_complet: string; role: Role; actif: boolean; derniere_connexion: Date | null }>(
    'SELECT id, email, nom_complet, role, actif, derniere_connexion FROM utilisateur ORDER BY actif DESC, nom_complet',
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Comptes de l’équipe</h1>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="carte overflow-x-auto lg:col-span-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Nom</th>
                <th className="px-4 py-2.5">Rôle</th>
                <th className="px-4 py-2.5">Dernière connexion</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {comptes.map((c) => (
                <tr key={c.id} className={c.actif ? '' : 'text-encre-douce'}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.nom_complet}{!c.actif && ' (désactivé)'}</div>
                    <div className="text-xs text-encre-douce">{c.email}</div>
                  </td>
                  <td className="px-4 py-2.5">{ROLES[c.role].libelle}</td>
                  <td className="px-4 py-2.5 text-encre-douce">
                    {c.derniere_connexion
                      ? new Date(c.derniere_connexion).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' })
                      : 'Jamais'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.id !== ctx.utilisateur.id && <ActionsCompte id={c.id} actif={c.actif} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="carte p-5">
          <h2 className="mb-3 font-bold">Nouveau compte</h2>
          <NouveauCompte />
        </section>
      </div>
    </div>
  );
}
