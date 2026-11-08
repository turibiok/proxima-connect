'use client';

import { useActionState } from 'react';
import { connexionClient } from '@/lib/client/actions';

export function FormulaireConnexionClient() {
  const [erreur, action, enCours] = useActionState(connexionClient, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="etiquette">Adresse e-mail</span>
        <input name="email" type="email" autoComplete="username" required className="champ" />
      </label>
      <label className="block">
        <span className="etiquette">Mot de passe</span>
        <input name="mot_de_passe" type="password" autoComplete="current-password" required className="champ" />
      </label>
      {erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire w-full" disabled={enCours}>{enCours ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  );
}
