'use client';

import { useActionState } from 'react';
import { ouvrirEspace } from '@/lib/espace/actions';

export function Ouverture({ jeton }: { jeton: string }) {
  const [erreur, action, enCours] = useActionState(ouvrirEspace.bind(null, jeton), null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="etiquette">Date de naissance</span>
        <input type="date" name="date_naissance" required className="champ" autoComplete="bday" />
      </label>
      {erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire w-full" disabled={enCours}>{enCours ? 'Vérification…' : 'Ouvrir mon espace'}</button>
      <p className="aide">Ce lien est personnel : ne le transmettez à personne. Sur ce téléphone, vous resterez connecté trois mois.</p>
    </form>
  );
}
