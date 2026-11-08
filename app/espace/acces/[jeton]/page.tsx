import { apercuLien } from '@/lib/espace/session';
import { accesAutorise, etatLien, MESSAGES_LIEN } from '@/lib/espace/regles';
import { Ouverture } from './Ouverture';

export const metadata = { title: 'Ouvrir mon espace' };

/**
 * Page du lien personnel. Elle ne fait que demander la date de naissance :
 * un apercu de lien (WhatsApp affiche un apercu en recevant le message) ne
 * consomme donc pas le lien, seul l'envoi du formulaire le fait.
 */
export default async function Acces({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const l = await apercuLien(jeton);
  const etat = l ? etatLien(l) : null;
  const valable = l && etat === 'valide' && accesAutorise(l.statut);

  return (
    <section className="carte mx-auto max-w-md space-y-4 p-6">
      {valable ? (
        <>
          <h1 className="text-xl font-bold">Bonjour {l.prenoms.trim().split(/\s+/)[0]}</h1>
          <p className="text-sm">Pour ouvrir votre espace PROXIMA CONNECT, confirmez votre date de naissance.</p>
          <Ouverture jeton={jeton} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">Lien non valable</h1>
          <p className="text-sm">
            {etat && etat !== 'valide' ? MESSAGES_LIEN[etat] : 'Ce lien n’est pas reconnu.'} Demandez un nouveau lien à l’équipe PROXIMA.
          </p>
        </>
      )}
    </section>
  );
}
