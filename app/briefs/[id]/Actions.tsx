'use client';

import { useActionState, useTransition } from 'react';
import { abandonnerBrief, rouvrirBrief } from '@/lib/clients/actions';

export function Abandon({ id }: { id: string }) {
  const [erreur, action, enCours] = useActionState(abandonnerBrief.bind(null, id), null);
  return (
    <form action={action} className="space-y-2">
      <input name="motif" placeholder="Motif : budget refusé, client injoignable…" className="champ" maxLength={500} />
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="btn-danger w-full" disabled={enCours}>Abandonner le brief</button>
    </form>
  );
}

export function Reouverture({ id }: { id: string }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" disabled={enCours} onClick={() => demarrer(() => rouvrirBrief(id))} className="btn ml-3 px-3 py-1 text-xs">
      Rouvrir
    </button>
  );
}
