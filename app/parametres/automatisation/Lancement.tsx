'use client';

import { useActionState } from 'react';
import { lancerTaches } from '@/lib/automatisation/actions';

export function LancementTaches() {
  const [etat, action, enCours] = useActionState(lancerTaches, null);
  return (
    <form action={action} className="space-y-2">
      <button className="btn" disabled={enCours}>{enCours ? 'En cours…' : 'Lancer les tâches maintenant'}</button>
      {etat?.bilan && (
        <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-ok">
          Terminé : {etat.bilan.expirees} expirée(s), {etat.bilan.relances} relance(s), {etat.bilan.rappels} rappel(s),{' '}
          {etat.bilan.confirmations} confirmation(s), {etat.bilan.ajoutes} profil(s) sollicité(s), {etat.bilan.echecs} échec(s).
        </p>
      )}
      {etat?.erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-danger">{etat.erreur}</p>}
    </form>
  );
}
