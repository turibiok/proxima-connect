'use client';

import { useActionState, useEffect, useState } from 'react';
import { evaluer, type EtatEvaluation } from '@/lib/score/actions';
import type { Notes } from '@/lib/score/regles';
import { SaisieNotes } from '@/components/Notes';

export function FormulaireEvaluation({
  missionId,
  intervenantId,
  initiales,
  commentaire,
}: {
  missionId: string;
  intervenantId: string;
  initiales?: Notes;
  commentaire?: string | null;
}) {
  const [etat, action, enCours] = useActionState<EtatEvaluation, FormData>(evaluer.bind(null, missionId, intervenantId), null);
  const [ouvert, setOuvert] = useState(!initiales);
  useEffect(() => {
    if (etat?.ok) setOuvert(false);
  }, [etat]);

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {etat?.ok && <span role="status" className="text-sm text-ok">{etat.ok}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="btn px-3 py-1 text-xs">
          Modifier l’évaluation
        </button>
      </div>
    );
  }

  const v = etat?.valeurs;
  return (
    <form action={action} key={v ? JSON.stringify(v) : 'initial'} className="space-y-4">
      {etat?.erreurs?.general && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreurs.general}</p>}
      <SaisieNotes initiales={v ?? initiales ?? {}} erreurs={etat?.erreurs} />
      <label className="block">
        <span className="etiquette">Commentaire <span className="font-normal text-encre-douce">(obligatoire pour une note de 1 ou 2)</span></span>
        <textarea name="commentaire" rows={2} defaultValue={v?.commentaire ?? commentaire ?? ''} maxLength={1000} className="champ" />
        {etat?.erreurs?.commentaire && <span className="erreur block">{etat.erreurs.commentaire}</span>}
      </label>
      <div className="flex gap-2">
        <button className="btn-primaire" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer l’évaluation'}</button>
        {initiales && (
          <button type="button" onClick={() => setOuvert(false)} className="btn">Annuler</button>
        )}
      </div>
    </form>
  );
}
