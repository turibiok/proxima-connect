'use client';

import { useActionState, useState, useTransition } from 'react';
import { basculerCompteClient, creerCompteClient, reinitialiserCompteClient, type EtatCompteClient } from '@/lib/client/actions';

export interface CompteAffiche {
  id: string;
  email: string;
  nom_complet: string;
  actif: boolean;
  mdp_provisoire: boolean;
  derniere_connexion: string | null;
}

/** Acces a l'espace client (phase 4) : creation, mot de passe provisoire, desactivation. */
export function AccesClient({ clientId, comptes, modifiable }: { clientId: string; comptes: CompteAffiche[]; modifiable: boolean }) {
  const [etat, creer, enCours] = useActionState<EtatCompteClient, FormData>(creerCompteClient.bind(null, clientId), null);
  const [provisoire, setProvisoire] = useState<{ email: string; motDePasse: string } | null>(null);
  const [, demarrer] = useTransition();
  const affiche = etat?.cree ?? provisoire;

  return (
    <div className="space-y-3 text-sm">
      {comptes.length === 0 ? (
        <p className="text-encre-douce">Aucun accès pour le moment.</p>
      ) : (
        <ul className="divide-y divide-trait">
          {comptes.map((k) => (
            <li key={k.id} className={`py-2 ${k.actif ? '' : 'opacity-60'}`}>
              <div className="font-medium">{k.nom_complet}</div>
              <div className="text-xs text-encre-douce">
                {k.email} · {!k.actif ? 'désactivé' : k.mdp_provisoire ? 'mot de passe provisoire' : k.derniere_connexion ? `vu le ${k.derniere_connexion}` : 'jamais connecté'}
              </div>
              {modifiable && (
                <div className="mt-1 flex gap-3 text-xs">
                  {k.actif && (
                    <button
                      className="text-marque hover:underline"
                      onClick={() =>
                        demarrer(async () => {
                          const r = await reinitialiserCompteClient(k.id);
                          if ('motDePasse' in r) setProvisoire(r);
                        })
                      }
                    >
                      Nouveau mot de passe provisoire
                    </button>
                  )}
                  <button className="text-danger hover:underline" onClick={() => demarrer(() => basculerCompteClient(k.id, !k.actif))}>
                    {k.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {affiche && (
        <div role="status" className="rounded-lg border border-ok/30 bg-ok-pale p-3 text-ok">
          Accès de <strong>{affiche.email}</strong> : mot de passe provisoire <code className="font-mono text-base text-encre">{affiche.motDePasse}</code>
          <span className="block text-xs">Transmettez-le de vive voix ou par un autre canal que l’adresse e-mail. Il ne sera plus affiché ; il devra être changé à la première connexion, sur /client.</span>
        </div>
      )}

      {modifiable && (
        <details>
          <summary className="cursor-pointer text-marque">+ Créer un accès</summary>
          <form action={creer} className="mt-2 space-y-2">
            <input name="nom_complet" placeholder="Nom de la personne" className="champ" maxLength={120} />
            <input name="email" type="email" placeholder="Adresse e-mail professionnelle" className="champ" maxLength={200} />
            {etat?.erreur && <p role="alert" className="erreur">{etat.erreur}</p>}
            <button className="btn px-3 py-1.5 text-sm" disabled={enCours}>Créer l’accès</button>
          </form>
        </details>
      )}
    </div>
  );
}
