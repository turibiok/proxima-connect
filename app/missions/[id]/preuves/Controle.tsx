'use client';

import { useActionState } from 'react';
import { ajouterControle, declarerIncident, resoudreIncident, statuerPreuve, type EtatSaisie } from '@/lib/preuves/actions';
import { GRAVITES, RESULTATS_CONTROLE, TYPES_CONTROLE } from '@/lib/preuves/regles';

/** Valider, rejeter avec motif, ou remettre a controler une preuve. */
export function StatutPreuve({ missionId, preuveId, statut }: { missionId: string; preuveId: string; statut: string }) {
  const [erreur, action, enCours] = useActionState(statuerPreuve.bind(null, missionId, preuveId), null);
  return (
    <div className="mt-3 border-t border-trait pt-3">
      {statut === 'en_attente' ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={action}>
            <input type="hidden" name="op" value="valider" />
            <button className="btn-primaire px-3 py-1 text-xs" disabled={enCours}>Valider</button>
          </form>
          <form action={action} className="flex flex-1 items-center gap-1">
            <input type="hidden" name="op" value="rejeter" />
            <input name="motif" placeholder="Motif du rejet" aria-label="Motif du rejet" className="champ min-w-0 flex-1 py-1 text-xs" maxLength={500} />
            <button className="btn-danger px-3 py-1 text-xs" disabled={enCours}>Rejeter</button>
          </form>
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="op" value="reouvrir" />
          <button className="text-xs text-encre-douce hover:underline" disabled={enCours}>Remettre à contrôler</button>
        </form>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </div>
  );
}

function Message({ etat }: { etat: EtatSaisie }) {
  if (etat?.ok) return <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>;
  if (etat?.erreurs?.general) return <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreurs.general}</p>;
  return null;
}

export function NouveauControle({ missionId, equipe }: { missionId: string; equipe: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(ajouterControle.bind(null, missionId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} key={etat?.ok ? 'vide' : JSON.stringify(v)} className="space-y-3">
      <Message etat={etat} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="etiquette">Contrôle</span>
          <select name="type" defaultValue={v.type ?? ''} className="champ">
            <option value="">Choisir…</option>
            {TYPES_CONTROLE.map((t) => <option key={t}>{t}</option>)}
          </select>
          {e.type && <span className="erreur block">{e.type}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Résultat</span>
          <select name="resultat" defaultValue={v.resultat ?? ''} className="champ">
            <option value="">Choisir…</option>
            {Object.entries(RESULTATS_CONTROLE).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
          {e.resultat && <span className="erreur block">{e.resultat}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Intervenant</span>
          <select name="intervenant_id" defaultValue={v.intervenant_id ?? ''} className="champ">
            <option value="">Toute l’équipe</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Constat</span>
        <textarea name="commentaire" rows={2} defaultValue={v.commentaire ?? ''} className="champ" />
        {e.commentaire && <span className="erreur block">{e.commentaire}</span>}
      </label>
      <button className="btn" disabled={enCours}>Enregistrer le contrôle</button>
    </form>
  );
}

export function NouvelIncident({ missionId, equipe }: { missionId: string; equipe: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(declarerIncident.bind(null, missionId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  return (
    <form action={action} key={etat?.ok ? 'vide' : JSON.stringify(v)} className="space-y-3">
      <Message etat={etat} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Gravité</span>
          <select name="gravite" defaultValue={v.gravite ?? ''} className="champ">
            <option value="">Choisir…</option>
            {Object.entries(GRAVITES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
          {e.gravite && <span className="erreur block">{e.gravite}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Intervenant concerné</span>
          <select name="intervenant_id" defaultValue={v.intervenant_id ?? ''} className="champ">
            <option value="">Aucun en particulier</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Ce qui s’est passé</span>
        <textarea name="description" rows={2} defaultValue={v.description ?? ''} className="champ" />
        {e.description && <span className="erreur block">{e.description}</span>}
      </label>
      <button className="btn" disabled={enCours}>Déclarer l’incident</button>
    </form>
  );
}

export function Resolution({ missionId, incidentId }: { missionId: string; incidentId: string }) {
  const [erreur, action, enCours] = useActionState(resoudreIncident.bind(null, missionId, incidentId), null);
  return (
    <form action={action} className="mt-2 flex gap-1">
      <input name="resolution" placeholder="Comment l’incident a été résolu" aria-label="Résolution" className="champ min-w-0 flex-1 py-1 text-xs" />
      <button className="btn px-3 py-1 text-xs" disabled={enCours}>Résolu</button>
      {erreur && <p className="erreur">{erreur}</p>}
    </form>
  );
}
