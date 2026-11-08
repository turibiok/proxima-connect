import { redirect } from 'next/navigation';
import { compteCourant } from '@/lib/client/session';
import { FormulaireMotDePasseClient } from './Formulaire';

export const metadata = { title: 'Mot de passe' };

export default async function MotDePasseClient() {
  const k = await compteCourant();
  if (!k) redirect('/client/connexion');
  return (
    <section className="carte mx-auto max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold">{k.mdp_provisoire ? 'Choisissez votre mot de passe' : 'Changer de mot de passe'}</h1>
        {k.mdp_provisoire && <p className="text-sm text-encre-douce">Le mot de passe reçu est provisoire : remplacez-le par un mot de passe que vous seul connaissez.</p>}
      </div>
      <FormulaireMotDePasseClient />
    </section>
  );
}
