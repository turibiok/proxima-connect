import { redirect } from 'next/navigation';
import { contexte } from '@/lib/auth/session';
import { FormulaireMotDePasse } from './Formulaire';

export const metadata = { title: 'Mot de passe' };

export default async function MotDePasse() {
  const ctx = await contexte();
  if (!ctx) redirect('/connexion');
  const provisoire = ctx.utilisateur.mdp_provisoire;
  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="carte p-6">
        <h1 className="text-xl font-bold">{provisoire ? 'Choisissez votre mot de passe' : 'Changer de mot de passe'}</h1>
        <p className="mb-5 mt-1 text-sm text-encre-douce">
          {provisoire
            ? 'Votre mot de passe actuel est provisoire : remplacez-le pour accéder à l’application.'
            : 'Vos autres sessions ouvertes seront fermées.'}
        </p>
        <FormulaireMotDePasse />
        <p className="aide mt-4">Au moins 10 caractères, avec des minuscules, des majuscules et un chiffre.</p>
      </div>
    </div>
  );
}
