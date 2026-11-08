import { exiger } from '@/lib/auth/session';
import { Onglets } from '@/components/Onglets';

export default async function Finances({ children }: { children: React.ReactNode }) {
  await exiger('finance:lire');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Finances</h1>
        <p className="text-sm text-encre-douce">Paiements des intervenants, factures et règlements des clients.</p>
      </div>
      <Onglets
        liens={[
          { href: '/finances', libelle: 'Vue d’ensemble' },
          { href: '/finances/paiements', libelle: 'Paiements intervenants' },
          { href: '/finances/factures', libelle: 'Factures clients' },
        ]}
      />
      {children}
    </div>
  );
}
