'use client';

import { useActionState, useState, useTransition } from 'react';
import { ROLES } from '@/lib/auth/roles';
import { basculerCompte, creerCompte, reinitialiserMotDePasse } from './actions';

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
      {etat?.cree && <Provisoire email={etat.cree.email} motDePasse={etat.cree.motDePasse} />}
      <button className="btn-primaire w-full" disabled={enCours}>Créer le compte</button>
    </form>
  );
}

function Provisoire({ email, motDePasse }: { email: string; motDePasse: string }) {
  return (
    <div role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">
      Mot de passe provisoire de {email}, affiché une seule fois. Transmettez-le de vive voix : il devra être remplacé à la
      première connexion.
      <code className="mt-1 block select-all rounded bg-white px-2 py-1 font-mono text-encre">{motDePasse}</code>
    </div>
  );
}

export function ActionsCompte({ id, actif }: { id: string; actif: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<{ email: string; motDePasse: string } | { erreur: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {actif && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              if (confirm('Générer un nouveau mot de passe provisoire ? L’ancien ne fonctionnera plus.')) {
                demarrer(async () => setResultat(await reinitialiserMotDePasse(id)));
              }
            }}
            className="btn px-3 py-1 text-xs"
          >
            Réinitialiser le mot de passe
          </button>
        )}
        <button
          type="button"
          disabled={enCours}
          onClick={() => demarrer(() => basculerCompte(id, !actif))}
          className={actif ? 'btn-danger px-3 py-1 text-xs' : 'btn px-3 py-1 text-xs'}
        >
          {actif ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>
      {resultat && ('erreur' in resultat ? <p className="erreur">{resultat.erreur}</p> : <Provisoire {...resultat} />)}
    </div>
  );
}
