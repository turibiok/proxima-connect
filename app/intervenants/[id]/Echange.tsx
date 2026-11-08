'use client';

import { useActionState } from 'react';
import { consignerEchange, type EtatEnvoi } from '@/lib/communication/actions';
import { CANAUX, type Canal } from '@/lib/communication/regles';

/** Consigner un appel, un message recu, un e-mail : ce qui ne passe pas par le programme. */
export function ConsignerEchange({ intervenantId, missions }: { intervenantId: string; missions: { id: string; reference: string; titre: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatEnvoi, FormData>(consignerEchange.bind(null, intervenantId), null);
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select name="sens" defaultValue="entrant" aria-label="Sens" className="champ text-sm">
          <option value="entrant">L’intervenant nous a contactés</option>
          <option value="sortant">Nous l’avons contacté</option>
        </select>
        <select name="canal" defaultValue="appel" aria-label="Canal" className="champ text-sm">
          {(Object.keys(CANAUX) as Canal[]).map((c) => <option key={c} value={c}>{CANAUX[c]}</option>)}
        </select>
        <select name="mission_id" defaultValue="" aria-label="Mission concernée" className="champ text-sm">
          <option value="">Sans mission</option>
          {missions.map((m) => <option key={m.id} value={m.id}>{m.reference} · {m.titre}</option>)}
        </select>
      </div>
      <textarea name="contenu" rows={2} maxLength={1000} placeholder="Résumé de l’échange (ex. : demande la date de paiement, prévient d’un retard demain)" className="champ text-sm" />
      {(e.contenu || e.canal || e.sens || e.general) && <p role="alert" className="erreur">{e.contenu ?? e.canal ?? e.sens ?? e.general}</p>}
      {etat?.ok && <p role="status" className="text-xs font-medium text-ok">{etat.ok}</p>}
      <button className="btn px-3 py-1.5 text-sm" disabled={enCours}>Consigner</button>
    </form>
  );
}
