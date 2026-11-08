import { redirect } from 'next/navigation';
import { compteCourant } from '@/lib/client/session';
import { FormulaireConnexionClient } from './Formulaire';

export const metadata = { title: 'Connexion' };

export default async function ConnexionClient() {
  const k = await compteCourant();
  if (k) redirect(k.mdp_provisoire ? '/client/mot-de-passe' : '/client');
  return (
    <section className="carte mx-auto max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold">Espace client</h1>
        <p className="text-sm text-encre-douce">Suivi de vos missions, rapports et factures PROXIMA CONNECT.</p>
      </div>
      <FormulaireConnexionClient />
      <p className="text-xs text-encre-douce">Pas encore d’accès, ou mot de passe oublié ? Votre interlocuteur commercial chez PROXIMA vous en crée un.</p>
    </section>
  );
}
