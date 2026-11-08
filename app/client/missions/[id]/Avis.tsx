'use client';

import { useActionState } from 'react';
import { donnerAvis } from '@/lib/client/actions';
import { NOTES_SATISFACTION } from '@/lib/reporting/regles';

export function AvisClient({ missionId, note }: { missionId: string; note: number | null }) {
  const [etat, action, enCours] = useActionState(donnerAvis.bind(null, missionId), null);
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} className="mt-3 space-y-3">
      <fieldset>
        <legend className="etiquette">{note ? 'Modifier votre note' : 'Votre note'}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="coche" title={NOTES_SATISFACTION[n]}>
              <input type="radio" name="note" value={n} defaultChecked={note === n} /> {n} · {NOTES_SATISFACTION[n]}
            </label>
          ))}
        </div>
        {e.note && <p className="erreur">{e.note}</p>}
      </fieldset>
      <textarea name="commentaire" rows={2} maxLength={1000} placeholder="Ce qui vous a plu, ce qui serait à améliorer (attendu pour une note de 1 ou 2)" className="champ" />
      {e.commentaire && <p className="erreur">{e.commentaire}</p>}
      {e.general && <p role="alert" className="erreur">{e.general}</p>}
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Envoi…' : 'Envoyer mon avis'}</button>
    </form>
  );
}
