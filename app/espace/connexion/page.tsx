import { redirect } from 'next/navigation';
import { intervenantCourant } from '@/lib/espace/session';
import { DUREE_LIEN_JOURS } from '@/lib/espace/regles';

export const metadata = { title: 'Accès' };

export default async function ConnexionEspace() {
  if (await intervenantCourant()) redirect('/espace');
  return (
    <section className="carte mx-auto max-w-md space-y-3 p-6 text-sm">
      <h1 className="text-xl font-bold">Votre espace intervenant</h1>
      <p>Vous y retrouvez vos missions, vos paiements et votre PROXIMA SCORE.</p>
      <p>
        On y accède par un <strong>lien personnel</strong> que l’équipe PROXIMA vous envoie par WhatsApp ou par SMS. Il sert une fois et reste
        valable {DUREE_LIEN_JOURS} jours ; votre date de naissance vous est demandée à l’ouverture.
      </p>
      <p className="text-encre-douce">Pas de lien, ou lien expiré ? Demandez-en un nouveau à l’équipe PROXIMA, au numéro qui vous contacte pour les missions.</p>
    </section>
  );
}
