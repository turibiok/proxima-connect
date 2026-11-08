import type { Metadata } from 'next';
import { compteCourant } from '@/lib/client/session';
import { deconnexionClient } from '@/lib/client/actions';
import { Onglets } from '@/components/Onglets';

export const metadata: Metadata = {
  title: { default: 'Espace client', template: '%s · Espace client PROXIMA' },
  robots: { index: false, follow: false },
};

export default async function EspaceClient({ children }: { children: React.ReactNode }) {
  const k = await compteCourant();
  const connecte = k && !k.mdp_provisoire;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {connecte && (
        <>
          <div className="non-imprime flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-encre-douce">Espace client</p>
              <p className="text-lg font-bold">{k.raison_sociale}</p>
              <p className="text-xs text-encre-douce">{k.nom_complet} · {k.email}</p>
            </div>
            <form action={deconnexionClient}>
              <button className="btn px-3 py-1.5 text-xs">Se déconnecter</button>
            </form>
          </div>
          <div className="non-imprime">
            <Onglets
              liens={[
                { href: '/client', libelle: 'Missions' },
                { href: '/client/factures', libelle: 'Factures' },
              ]}
            />
          </div>
        </>
      )}
      {children}
    </div>
  );
}
