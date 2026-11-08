'use client';

import { startTransition, useActionState, useState } from 'react';
import { enregistrerRapport, enregistrerSatisfaction, transmettreRapport, type EtatRapport } from '@/lib/reporting/actions';
import { CANAUX_RAPPORT, INDICATEURS_MAX, NOTES_SATISFACTION, type CanalRapport } from '@/lib/reporting/regles';

export function Imprimer() {
  return (
    <button type="button" onClick={() => window.print()} className="btn">
      Imprimer ou enregistrer en PDF
    </button>
  );
}

type Ind = { libelle: string; cible: string | null; resultat: string | null };

/** Synthese et indicateurs convenus, en lignes que l'on ajoute au besoin. */
export function Preparation({ missionId, synthese, indicateurs }: { missionId: string; synthese: string; indicateurs: Ind[] }) {
  const [etat, action, enCours] = useActionState<EtatRapport, FormData>(
    async (precedent: EtatRapport, f: FormData) => {
      const r = await enregistrerRapport(missionId, precedent, f);
      // les lignes ajoutees sont desormais dans les donnees enregistrees
      if (r?.ok) setAjoutees(0);
      return r;
    },
    null,
  );
  // Lignes enregistrees, plus celles ajoutees depuis le dernier enregistrement.
  const [ajoutees, setAjoutees] = useState(indicateurs.length ? 0 : 1);
  const vide: Ind = { libelle: '', cible: null, resultat: null };
  const lignes = [...indicateurs, ...Array.from({ length: ajoutees }, () => vide)];
  // Envoi sans la remise a zero automatique des formulaires de React : une
  // erreur sur une ligne ne doit pas effacer tout ce qui vient d'etre saisi.
  const envoyer = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    startTransition(() => action(f));
  };
  return (
    <form onSubmit={envoyer} className="mt-4 space-y-4">
      <label className="block">
        <span className="etiquette">Synthèse pour le client</span>
        <textarea name="synthese" rows={4} maxLength={4000} defaultValue={synthese} placeholder="Ce qui a été fait, ce qu’il faut en retenir, les recommandations éventuelles." className="champ" />
      </label>
      <fieldset>
        <legend className="etiquette">Indicateurs convenus avec le client</legend>
        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <input name="libelle" defaultValue={l.libelle} maxLength={200} placeholder="Indicateur (ex. : boutiques visitées)" aria-label={`Indicateur ${i + 1}`} className="champ" />
              <input name="cible" defaultValue={l.cible ?? ''} maxLength={200} placeholder="Objectif" aria-label={`Objectif ${i + 1}`} className="champ" />
              <input name="resultat" defaultValue={l.resultat ?? ''} maxLength={500} placeholder="Résultat" aria-label={`Résultat ${i + 1}`} className="champ" />
              {etat?.erreurs?.[`ligne_${i}`] && <p className="erreur sm:col-span-3">{etat.erreurs[`ligne_${i}`]}</p>}
            </div>
          ))}
        </div>
        {lignes.length < INDICATEURS_MAX && (
          <button type="button" onClick={() => setAjoutees(ajoutees + 1)} className="mt-2 text-sm text-marque hover:underline">
            + Ajouter un indicateur
          </button>
        )}
        <p className="aide">Pour retirer un indicateur, videz sa ligne.</p>
      </fieldset>
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {etat?.erreurs?.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreurs.general}</p>}
      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer le rapport'}</button>
    </form>
  );
}

export function Transmission({ missionId, dejaTransmis, destinataire, maintenant }: { missionId: string; dejaTransmis: boolean; destinataire: string; maintenant: string }) {
  const [etat, action, enCours] = useActionState<EtatRapport, FormData>(transmettreRapport.bind(null, missionId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  const formulaire = (
    <form action={action} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Canal</span>
          <select name="canal" defaultValue={v.canal ?? 'email'} className="champ">
            {(Object.keys(CANAUX_RAPPORT) as CanalRapport[]).map((c) => <option key={c} value={c}>{CANAUX_RAPPORT[c]}</option>)}
          </select>
          {e.canal && <span className="erreur block">{e.canal}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Date et heure</span>
          <input type="datetime-local" name="transmis_le" defaultValue={v.transmis_le ?? maintenant} className="champ" />
          {e.transmis_le && <span className="erreur block">{e.transmis_le}</span>}
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Destinataire</span>
        <input name="destinataire" defaultValue={v.destinataire ?? destinataire} maxLength={200} placeholder="Nom, adresse e-mail ou numéro" className="champ" />
        {e.destinataire && <span className="erreur block">{e.destinataire}</span>}
      </label>
      <p className="aide">Enregistrez ou imprimez d’abord le rapport en PDF, envoyez-le, puis consignez l’envoi ici.</p>
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {e.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}
      <button className={dejaTransmis ? 'btn' : 'btn-primaire'} disabled={enCours}>
        {enCours ? 'Enregistrement…' : dejaTransmis ? 'Enregistrer un nouvel envoi' : 'Enregistrer la transmission'}
      </button>
    </form>
  );
  return dejaTransmis && !etat ? (
    <details className="text-sm">
      <summary className="mt-2 cursor-pointer text-xs text-marque">Le rapport a été renvoyé (version corrigée)…</summary>
      {formulaire}
    </details>
  ) : (
    formulaire
  );
}

export function Satisfaction({ missionId, note }: { missionId: string; note: number | null }) {
  const [etat, action, enCours] = useActionState<EtatRapport, FormData>(enregistrerSatisfaction.bind(null, missionId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} className="mt-3 space-y-3">
      <fieldset>
        <legend className="etiquette">{note ? 'Corriger la note' : 'Note du client'}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="coche" title={NOTES_SATISFACTION[n]}>
              <input type="radio" name="note" value={n} defaultChecked={String(v.note ?? note ?? '') === String(n)} /> {n}
            </label>
          ))}
        </div>
        {e.note && <p className="erreur">{e.note}</p>}
      </fieldset>
      <textarea name="commentaire" rows={2} maxLength={1000} defaultValue={v.commentaire} placeholder="Ce que dit le client (attendu si la note est de 1 ou 2)" className="champ" />
      {e.commentaire && <p className="erreur">{e.commentaire}</p>}
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {e.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}
      <button className="btn" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer l’avis'}</button>
    </form>
  );
}
