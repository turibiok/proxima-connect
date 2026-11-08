'use client';

import { useActionState } from 'react';
import { reglerSelectionAuto, type EtatSelectionAuto } from '@/lib/automatisation/actions';

/** Reglage et lancement de la selection automatique d'une mission (phase 3). */
export function SelectionAutomatique({
  missionId,
  actif,
  reserve,
  delai,
  envoi,
  apercu,
}: {
  missionId: string;
  actif: boolean;
  reserve: number;
  delai: number;
  /** le programme peut-il envoyer lui-meme les propositions ? */
  envoi: boolean;
  /** profils que le programme retiendrait maintenant */
  apercu: { titulaires: string[]; remplacants: string[] };
}) {
  const [etat, action, enCours] = useActionState<EtatSelectionAuto, FormData>(reglerSelectionAuto.bind(null, missionId), null);
  return (
    <form action={action} className="carte space-y-3 border-l-4 border-l-marque p-5">
      <div>
        <h2 className="font-bold">Sélection automatique</h2>
        <p className="text-sm text-encre-douce">
          Le programme retient les profils compatibles les mieux classés pour les places libres, titulaires puis réserve,
          {envoi
            ? ' et leur envoie la proposition. Il relance à mi-délai et repropose les places refusées ou restées sans réponse.'
            : ' et les ajoute « à proposer ». Aucun fournisseur d’envoi n’est configuré : les propositions partent depuis la page de la mission.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Réserve (en % de l’effectif)</span>
          <input name="reserve_pourcent" type="number" min={0} max={100} defaultValue={reserve} className="champ" />
        </label>
        <label className="block">
          <span className="etiquette">Délai de réponse (heures)</span>
          <input name="delai_reponse_heures" type="number" min={2} max={168} defaultValue={delai} className="champ" />
        </label>
      </div>
      <label className="coche w-fit">
        <input type="checkbox" name="selection_auto" defaultChecked={actif} /> Continuer automatiquement jusqu’à ce que l’équipe soit complète
      </label>
      <p className="text-xs text-encre-douce">
        Maintenant : {apercu.titulaires.length ? `${apercu.titulaires.join(', ')} comme titulaire${apercu.titulaires.length > 1 ? 's' : ''}` : 'aucune place de titulaire à pourvoir'}
        {apercu.remplacants.length > 0 && ` ; ${apercu.remplacants.join(', ')} en réserve`}.
      </p>
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {etat?.erreur && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <button name="lancer" value="1" className="btn-primaire" disabled={enCours || !(apercu.titulaires.length + apercu.remplacants.length)}>
          {enCours ? 'En cours…' : envoi ? 'Lancer : solliciter ces profils' : 'Lancer : ajouter ces profils'}
        </button>
        <button className="btn" disabled={enCours}>Enregistrer les réglages</button>
      </div>
    </form>
  );
}
