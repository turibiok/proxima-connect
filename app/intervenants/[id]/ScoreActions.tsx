'use client';

import { useActionState, useState } from 'react';
import { contester, trancher } from '@/lib/score/actions';
import { ISSUES, type Issue, type Notes } from '@/lib/score/regles';
import { SaisieNotes } from '@/components/Notes';

/** Consigner la contestation exprimee par l'intervenant. */
export function Contestation({ evaluationId }: { evaluationId: string }) {
  const [erreur, action, enCours] = useActionState(contester.bind(null, evaluationId), null);
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-marque">L’intervenant conteste cette évaluation</summary>
      <form action={action} className="mt-2 space-y-2">
        <textarea name="motif" rows={2} maxLength={1000} placeholder="Ce que l’intervenant conteste, avec ses arguments" className="champ" />
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn px-3 py-1 text-xs" disabled={enCours}>Enregistrer la contestation</button>
      </form>
    </details>
  );
}

/** Trancher : maintenir, corriger (nouvelles notes) ou annuler l'evaluation. */
export function Traitement({ evaluationId, notes }: { evaluationId: string; notes: Notes }) {
  const [erreur, action, enCours] = useActionState(trancher.bind(null, evaluationId), null);
  const [issue, setIssue] = useState<Issue | ''>('');
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-alerte/30 bg-alerte-pale/40 p-3">
      <fieldset>
        <legend className="text-sm font-medium">Décision</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(ISSUES) as Issue[]).map((i) => (
            <label key={i} className="coche">
              <input type="radio" name="issue" value={i} checked={issue === i} onChange={() => setIssue(i)} /> {ISSUES[i]}
            </label>
          ))}
        </div>
      </fieldset>
      {issue === 'corrigee' && (
        <div className="rounded-lg bg-white p-3">
          <p className="mb-2 text-xs text-encre-douce">Notes corrigées :</p>
          <SaisieNotes initiales={notes} />
        </div>
      )}
      <textarea name="explication" rows={2} maxLength={1000} placeholder="Explication de la décision, communiquée à l’intervenant" className="champ" />
      {issue === 'corrigee' && <input type="hidden" name="commentaire" value="Notes corrigées après contestation" />}
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="btn-primaire px-3 py-1.5 text-sm" disabled={enCours || !issue}>Enregistrer la décision</button>
    </form>
  );
}
