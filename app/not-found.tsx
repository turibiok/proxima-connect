import Link from 'next/link';

export const metadata = { title: 'Page introuvable' };

export default function Introuvable() {
  return (
    <div className="carte mx-auto mt-8 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Page introuvable</h1>
      <p className="mt-2 text-sm text-encre-douce">Cette adresse ne correspond à aucune page, ou l’élément a été supprimé.</p>
      <Link href="/" className="btn mt-5">Retour à l’accueil</Link>
    </div>
  );
}
