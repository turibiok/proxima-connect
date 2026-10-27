import Link from 'next/link';
import { redirect } from 'next/navigation';
import { contexte } from '@/lib/auth/session';
import { FormulaireConnexion } from './Formulaire';

export const metadata = { title: 'Connexion' };

export default async function Connexion() {
  if (await contexte()) redirect('/');
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <div className="carte p-6">
        <h1 className="text-xl font-bold">Espace équipe</h1>
        <p className="mb-5 mt-1 text-sm text-encre-douce">Réservé aux équipes PROXIMA CONNECT.</p>
        <FormulaireConnexion />
      </div>
      <p className="mt-4 text-center text-sm text-encre-douce">
        Vous souhaitez devenir intervenant ?{' '}
        <Link href="/inscription" className="font-semibold text-marque hover:underline">
          Inscrivez-vous
        </Link>
      </p>
    </div>
  );
}
