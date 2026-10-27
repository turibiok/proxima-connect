'use client';

import { useTransition } from 'react';
import { changerStatutCommercial } from '@/lib/clients/actions';
import { STATUTS_COMMERCIAUX, type StatutCommercial } from '@/lib/clients/regles';

/** Le cycle commercial se lit de gauche a droite : prospect, pilote, actif, recurrent. */
export function ChoixStatutCommercial({ id, actuel }: { id: string; actuel: StatutCommercial }) {
  const [enCours, demarrer] = useTransition();
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(STATUTS_COMMERCIAUX) as StatutCommercial[]).map((s) => (
        <button
          key={s}
          type="button"
          disabled={enCours || s === actuel}
          aria-pressed={s === actuel}
          onClick={() => demarrer(() => changerStatutCommercial(id, s))}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            s === actuel ? 'border-marque bg-marque-pale text-marque-fonce' : 'border-trait bg-white hover:bg-papier disabled:opacity-60'
          }`}
        >
          {STATUTS_COMMERCIAUX[s].libelle}
        </button>
      ))}
    </div>
  );
}
