'use client';

import { useActionState, useTransition } from 'react';
import { ROLES } from '@/lib/auth/roles';
import { basculerCompte, creerCompte } from './actions';

export function NouveauCompte() {
  const [etat, action, enCours] = useActionState(creerCompte, null);
  return (
    <form action={action} className="space-y-3">
      <input name="nom_complet" placeholder="Nom complet" className="champ" required />
      <input name="email" type="email" placeholder="Adresse e-mail" className="champ" required />
      <select name="role" className="champ" defaultValue="recrutement">
        {Object.entries(ROLES).map(([code, r]) => (
          <option key={code} value={code}>{r.libelle}</option>
        ))}
      </select>
      {etat?.erreur && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreur}</p>}
      {etat?.cree && (
        <div className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">
          Compte créé pour {etat.cree.email}. Mot de passe provisoire, affiché une seule fois :
          <code className="mt-1 block select-all rounded bg-white px-2 py-1 font-mono text-encre">{etat.cree.motDePasse}</code>
        </div>
      )}
      <button className="btn-primaire w-full" disabled={enCours}>Créer le compte</button>
    </form>
  );
}

export function BasculeCompte({ id, actif }: { id: string; actif: boolean }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" disabled={enCours} onClick={() => demarrer(() => basculerCompte(id, !actif))} className={actif ? 'btn-danger px-3 py-1 text-xs' : 'btn px-3 py-1 text-xs'}>
      {actif ? 'Désactiver' : 'Réactiver'}
    </button>
  );
}
