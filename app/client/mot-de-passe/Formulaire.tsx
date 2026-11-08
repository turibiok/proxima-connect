'use client';

import { useActionState } from 'react';
import { changerMotDePasseClient } from '@/lib/client/actions';

export function FormulaireMotDePasseClient() {
  const [erreur, action, enCours] = useActionState(changerMotDePasseClient, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="etiquette">Mot de passe actuel</span>
        <input name="ancien" type="password" autoComplete="current-password" required className="champ" />
      </label>
      <label className="block">
        <span className="etiquette">Nouveau mot de passe</span>
        <input name="nouveau" type="password" autoComplete="new-password" required className="champ" />
        <span className="aide">Au moins 10 caractères, avec minuscules, majuscules et un chiffre.</span>
      </label>
      <label className="block">
        <span className="etiquette">Confirmation</span>
        <input name="confirmation" type="password" autoComplete="new-password" required className="champ" />
      </label>
      {erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire w-full" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}
