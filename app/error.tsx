'use client';

/**
 * Erreur inattendue dans une page. Le detail technique reste dans les
 * journaux du serveur ; l'utilisateur recoit un message et un moyen de
 * reessayer, utile quand la base se reveille apres une periode d'inactivite.
 */
export default function Erreur({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="carte mx-auto mt-8 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Un problème est survenu</h1>
      <p className="mt-2 text-sm text-encre-douce">
        La page n’a pas pu s’afficher. C’est souvent passager (connexion, base de données qui redémarre).
      </p>
      <button onClick={reset} className="btn-primaire mt-5">Réessayer</button>
    </div>
  );
}
