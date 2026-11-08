import type { Metadata } from 'next';
import { intervenantCourant } from '@/lib/espace/session';
import { quitterEspace } from '@/lib/espace/actions';
import { Onglets } from '@/components/Onglets';

export const metadata: Metadata = {
  title: { default: 'Mon espace', template: '%s · Mon espace PROXIMA' },
  // espace personnel : jamais dans les moteurs de recherche
  robots: { index: false, follow: false },
};

export default async function Espace({ children }: { children: React.ReactNode }) {
  const i = await intervenantCourant();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {i && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-encre-douce">Mon espace intervenant</p>
              <p className="text-lg font-bold">{i.prenoms} {i.nom} <span className="font-mono text-xs font-normal text-encre-douce">{i.reference}</span></p>
            </div>
            <form action={quitterEspace}>
              <button className="btn px-3 py-1.5 text-xs">Se déconnecter</button>
            </form>
          </div>
          <Onglets
            liens={[
              { href: '/espace', libelle: 'Accueil' },
              { href: '/espace/score', libelle: 'Mon score' },
              { href: '/espace/profil', libelle: 'Mon profil' },
            ]}
          />
        </>
      )}
      {children}
    </div>
  );
}
