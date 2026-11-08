'use client';

import { useActionState } from 'react';
import { repondreProposition } from '@/lib/espace/actions';

/** Accepter ou refuser une proposition depuis l'espace (phase 3). */
export function ReponseProposition({ affectationId }: { affectationId: string }) {
  const [erreurOui, accepter, enCoursOui] = useActionState(repondreProposition.bind(null, affectationId, 'accepte'), null);
  const [erreurNon, refuser, enCoursNon] = useActionState(repondreProposition.bind(null, affectationId, 'refuse'), null);
  const enCours = enCoursOui || enCoursNon;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <form action={accepter}>
          <button className="btn-primaire" disabled={enCours}>J’accepte</button>
        </form>
        <form action={refuser}>
          <button className="btn" disabled={enCours}>Je refuse</button>
        </form>
      </div>
      {(erreurOui || erreurNon) && <p role="alert" className="erreur">{erreurOui ?? erreurNon}</p>}
    </div>
  );
}
