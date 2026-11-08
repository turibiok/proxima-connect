import { exiger } from '@/lib/auth/session';
import { Onglets } from '@/components/Onglets';

export default async function Reporting({ children }: { children: React.ReactNode }) {
  await exiger('tableau:lire');
  return (
    <div className="space-y-5">
      <Onglets
        liens={[
          { href: '/reporting', libelle: 'Satisfaction, rentabilité, exports' },
          { href: '/reporting/territoires', libelle: 'Territoires' },
          { href: '/reporting/observatoire', libelle: 'Observatoire terrain' },
        ]}
      />
      {children}
    </div>
  );
}
