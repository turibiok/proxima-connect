'use client';

import { useActionState } from 'react';
import { reglerTerritoire } from '@/lib/territoires/actions';
import { STATUTS_TERRITOIRE, type StatutTerritoire } from '@/lib/territoires/regles';

export function ReglageTerritoire({ departement, statut, objectif, note }: { departement: string; statut: StatutTerritoire; objectif: number | null; note: string | null }) {
  const [erreur, action, enCours] = useActionState(reglerTerritoire.bind(null, departement), null);
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-marque">Régler ce territoire</summary>
      <form action={action} className="mt-2 grid gap-2 sm:grid-cols-[10rem_8rem_1fr_auto] sm:items-end">
        <label className="block">
          <span className="etiquette text-xs">Statut</span>
          <select name="statut" defaultValue={statut} className="champ">
            {(Object.keys(STATUTS_TERRITOIRE) as StatutTerritoire[]).map((s) => <option key={s} value={s}>{STATUTS_TERRITOIRE[s].libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette text-xs">Objectif de profils</span>
          <input name="objectif_profils" type="number" min={0} defaultValue={objectif ?? ''} className="champ" />
        </label>
        <label className="block">
          <span className="etiquette text-xs">Note</span>
          <input name="note" defaultValue={note ?? ''} maxLength={300} placeholder="Ex. : ouverture prévue en mars, antenne à Parakou" className="champ" />
        </label>
        <button className="btn" disabled={enCours}>Enregistrer</button>
        {erreur && <p role="alert" className="erreur sm:col-span-4">{erreur}</p>}
      </form>
    </details>
  );
}
