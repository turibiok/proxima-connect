'use client';

import { useActionState } from 'react';
import { seConnecter } from '../actions-session';

export function FormulaireConnexion() {
  const [erreur, action, enCours] = useActionState(seConnecter, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="etiquette" htmlFor="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="champ" />
      </div>
      <div>
        <label className="etiquette" htmlFor="mot_de_passe">Mot de passe</label>
        <input id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="current-password" required className="champ" />
      </div>
      {erreur && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire w-full" disabled={enCours}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
