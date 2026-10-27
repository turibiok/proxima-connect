import Link from 'next/link';

export const metadata = { title: 'Accès refusé' };

export default function AccesRefuse() {
  return (
    <div className="carte mx-auto mt-8 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Accès refusé</h1>
      <p className="mt-2 text-sm text-encre-douce">Votre rôle ne donne pas accès à cette page.</p>
      <Link href="/" className="btn mt-5">
        Retour à l’accueil
      </Link>
    </div>
  );
}
