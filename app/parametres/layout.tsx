import { exiger } from '@/lib/auth/session';
import { Onglets } from '@/components/Onglets';

export default async function Parametres({ children }: { children: React.ReactNode }) {
  await exiger('parametre:gerer');
  return (
    <div className="space-y-5">
      <Onglets
        liens={[
          { href: '/parametres/score', libelle: 'PROXIMA SCORE' },
          { href: '/parametres/automatisation', libelle: 'Automatisation' },
        ]}
      />
      {children}
    </div>
  );
}
