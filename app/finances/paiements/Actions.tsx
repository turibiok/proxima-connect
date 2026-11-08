'use client';

import { useActionState } from 'react';
import { leverLitige, mettreEnLitige, payer, type EtatFinance } from '@/lib/finances/actions';
import { MODES_PAIEMENT, type ModePaiement, type StatutPaiement } from '@/lib/finances/regles';

export function ActionsPaiement({
  id,
  statut,
  modeDefaut,
  maintenant,
  montant,
  sansCompte,
}: {
  id: string;
  statut: StatutPaiement;
  modeDefaut: ModePaiement;
  /** Date et heure courantes, au format du champ, calculees cote serveur. */
  maintenant: string;
  montant: number;
  sansCompte: boolean;
}) {
  const [etatPaye, actionPayer, payeEnCours] = useActionState<EtatFinance, FormData>(payer.bind(null, id), null);
  const [etatLitige, actionLitige, litigeEnCours] = useActionState<EtatFinance, FormData>(mettreEnLitige.bind(null, id), null);
  const [etatLevee, actionLever, leveeEnCours] = useActionState<EtatFinance, FormData>(leverLitige.bind(null, id), null);
  const v = etatPaye?.valeurs ?? {};

  if (statut === 'en_litige') {
    return (
      <form action={actionLever} className="mt-3 space-y-2 border-t border-trait pt-3">
        <p className="text-sm font-medium">Lever le litige</p>
        <textarea name="explication" rows={2} maxLength={1000} defaultValue={etatLevee?.valeurs?.explication} placeholder="Comment le litige a été réglé (accord, vérification faite…)" className="champ" />
        {etatLevee?.erreurs?.explication && <p className="erreur">{etatLevee.erreurs.explication}</p>}
        <label className="block max-w-xs">
          <span className="etiquette">Montant corrigé (facultatif)</span>
          <input name="montant" inputMode="numeric" defaultValue={etatLevee?.valeurs?.montant} placeholder={String(montant)} className="champ" />
          {etatLevee?.erreurs?.montant && <span className="erreur block">{etatLevee.erreurs.montant}</span>}
        </label>
        {etatLevee?.erreurs?.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etatLevee.erreurs.general}</p>}
        <button className="btn px-3 py-1.5 text-sm" disabled={leveeEnCours}>Lever le litige</button>
      </form>
    );
  }

  return (
    <div className="mt-3 border-t border-trait pt-3">
      <form action={actionPayer} className="grid gap-2 sm:grid-cols-[10rem_1fr_12rem_auto] sm:items-start">
        <label className="block">
          <span className="sr-only">Mode</span>
          <select name="mode" defaultValue={v.mode ?? modeDefaut} className="champ" aria-label="Mode de paiement">
            {(Object.keys(MODES_PAIEMENT) as ModePaiement[]).map((m) => (
              <option key={m} value={m}>{MODES_PAIEMENT[m]}</option>
            ))}
          </select>
          {etatPaye?.erreurs?.mode && <span className="erreur block">{etatPaye.erreurs.mode}</span>}
        </label>
        <label className="block">
          <span className="sr-only">Référence</span>
          <input name="reference" defaultValue={v.reference} maxLength={100} placeholder="Référence de la transaction" aria-label="Référence de la transaction" className="champ" />
          {etatPaye?.erreurs?.reference && <span className="erreur block">{etatPaye.erreurs.reference}</span>}
        </label>
        <label className="block">
          <span className="sr-only">Date et heure</span>
          <input type="datetime-local" name="paye_le" defaultValue={v.paye_le ?? maintenant} aria-label="Date et heure du paiement" className="champ" />
          {etatPaye?.erreurs?.paye_le && <span className="erreur block">{etatPaye.erreurs.paye_le}</span>}
        </label>
        <button className="btn-primaire" disabled={payeEnCours}>{payeEnCours ? 'Enregistrement…' : 'Marquer payé'}</button>
      </form>
      {sansCompte && <p className="aide">Aucun compte de paiement sur la fiche : seul un paiement en espèces, contre reçu signé, est possible.</p>}
      {etatPaye?.erreurs?.general && <p role="alert" className="mt-2 rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etatPaye.erreurs.general}</p>}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-danger">Mettre en litige…</summary>
        <form action={actionLitige} className="mt-2 space-y-2">
          <textarea name="motif" rows={2} maxLength={1000} placeholder="Objet du litige (montant contesté, présence discutée…)" className="champ" />
          {etatLitige?.erreurs?.motif && <p className="erreur">{etatLitige.erreurs.motif}</p>}
          {etatLitige?.erreurs?.general && <p role="alert" className="erreur">{etatLitige.erreurs.general}</p>}
          <button className="btn-danger px-3 py-1.5 text-sm" disabled={litigeEnCours}>Mettre en litige</button>
        </form>
      </details>
    </div>
  );
}
