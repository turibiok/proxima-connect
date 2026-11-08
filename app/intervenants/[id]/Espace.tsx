'use client';

import { useActionState } from 'react';
import { fermerAcces, preparerLien, type EtatLienPrepare } from '@/lib/espace/actions';
import { Envoi } from '@/components/Envoi';

/** Preparer et envoyer le lien d'acces a l'espace, ou fermer les acces. */
export function GestionEspace({
  intervenantId,
  telephone,
  whatsapp,
  sessions,
}: {
  intervenantId: string;
  telephone: string;
  whatsapp: string | null;
  sessions: number;
}) {
  const [etat, preparer, enCours] = useActionState<EtatLienPrepare>(preparerLien.bind(null, intervenantId), null);
  return (
    <div className="space-y-3">
      {!etat?.lien && (
        <form action={preparer}>
          <button className="btn w-full" disabled={enCours}>{enCours ? 'Préparation…' : 'Préparer un lien d’accès'}</button>
        </form>
      )}
      {etat?.erreur && <p role="alert" className="erreur">{etat.erreur}</p>}
      {etat?.lien && etat.message && (
        <div className="rounded-lg border border-marque/30 bg-marque-pale/40 p-3">
          <p className="text-xs font-medium">Lien prêt : envoyez-le maintenant, il ne sera plus affiché ensuite.</p>
          <Envoi cible={{ intervenantId }} modele="acces" texte={etat.message} telephone={telephone} whatsapp={whatsapp} />
        </div>
      )}
      {sessions > 0 && (
        <form action={fermerAcces.bind(null, intervenantId)}>
          <button className="text-xs text-danger hover:underline">
            Déconnecter {sessions > 1 ? `les ${sessions} téléphones` : 'le téléphone'} et annuler les liens
          </button>
        </form>
      )}
    </div>
  );
}
