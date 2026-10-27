'use client';

import { useActionState } from 'react';
import { changerMotDePasse } from '../../actions-session';

export function FormulaireMotDePasse() {
  const [erreur, action, enCours] = useActionState(changerMotDePasse, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="etiquette" htmlFor="ancien">Mot de passe actuel</label>
        <input id="ancien" name="ancien" type="password" autoComplete="current-password" required className="champ" />
      </div>
      <div>
        <label className="etiquette" htmlFor="nouveau">Nouveau mot de passe</label>
        <input id="nouveau" name="nouveau" type="password" autoComplete="new-password" minLength={10} required className="champ" />
      </div>
      <div>
        <label className="etiquette" htmlFor="confirmation">Nouveau mot de passe, une seconde fois</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={10} required className="champ" />
      </div>
      {erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire w-full" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}
