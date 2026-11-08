'use client';

import { useActionState } from 'react';
import { annulerFacture, enregistrerReglement, type EtatFinance } from '@/lib/finances/actions';
import { MODES_REGLEMENT, type ModeReglement } from '@/lib/finances/regles';

export function Reglement({ factureId, reste, aujourdhui }: { factureId: string; reste: number; aujourdhui: string }) {
  const [etat, action, enCours] = useActionState<EtatFinance, FormData>(enregistrerReglement.bind(null, factureId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-trait pt-4">
      <p className="text-sm font-medium">Enregistrer un règlement reçu</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Montant (FCFA)</span>
          <input name="montant" inputMode="numeric" defaultValue={v.montant ?? String(reste)} className="champ" />
          {e.montant && <span className="erreur block">{e.montant}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Reçu le</span>
          <input type="date" name="regle_le" defaultValue={v.regle_le ?? aujourdhui} max={aujourdhui} className="champ" />
          {e.regle_le && <span className="erreur block">{e.regle_le}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Mode</span>
          <select name="mode" defaultValue={v.mode ?? 'virement'} className="champ">
            {(Object.keys(MODES_REGLEMENT) as ModeReglement[]).map((m) => <option key={m} value={m}>{MODES_REGLEMENT[m]}</option>)}
          </select>
          {e.mode && <span className="erreur block">{e.mode}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Référence</span>
          <input name="reference" defaultValue={v.reference} maxLength={100} placeholder="Transaction, virement ou n° de chèque" className="champ" />
          {e.reference && <span className="erreur block">{e.reference}</span>}
        </label>
      </div>
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {e.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}
      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer le règlement'}</button>
    </form>
  );
}

export function Annulation({ factureId }: { factureId: string }) {
  const [etat, action, enCours] = useActionState<EtatFinance, FormData>(annulerFacture.bind(null, factureId), null);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-danger">Annuler la facture…</summary>
      <form action={action} className="mt-2 space-y-2">
        <p className="text-xs text-encre-douce">Le numéro reste attribué : une facture annulée garde sa place dans la numérotation.</p>
        <input name="motif" maxLength={500} placeholder="Motif (erreur de montant, doublon…)" className="champ" />
        {etat?.erreurs?.motif && <p className="erreur">{etat.erreurs.motif}</p>}
        {etat?.erreurs?.general && <p role="alert" className="erreur">{etat.erreurs.general}</p>}
        <button className="btn-danger w-full" disabled={enCours}>Annuler la facture</button>
      </form>
    </details>
  );
}
