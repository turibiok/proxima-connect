'use client';

import { useActionState } from 'react';
import { changerStatut, enregistrerBriefing } from '@/lib/missions/actions';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';

export function ChangementEtape({
  id,
  suivante,
  precedente,
  blocage,
}: {
  id: string;
  suivante: StatutMission | null;
  precedente: StatutMission | null;
  /** Raison pour laquelle l'etape suivante n'est pas encore permise, calculee cote serveur. */
  blocage: string | null;
}) {
  const [erreur, action, enCours] = useActionState(changerStatut.bind(null, id), null);
  return (
    <div className="space-y-3">
      {suivante && (
        <form action={action}>
          <input type="hidden" name="vers" value={suivante} />
          <button className="btn-primaire w-full" disabled={enCours || !!blocage}>
            Passer à « {LIBELLES_STATUT_MISSION[suivante]} »
          </button>
          {blocage && <p className="aide">{blocage}</p>}
        </form>
      )}
      {precedente && (
        <form action={action}>
          <input type="hidden" name="vers" value={precedente} />
          <button className="w-full text-xs text-encre-douce hover:underline" disabled={enCours}>
            Revenir à « {LIBELLES_STATUT_MISSION[precedente]} »
          </button>
        </form>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-danger">Annuler la mission…</summary>
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="vers" value="annulee" />
          <input name="motif" placeholder="Motif de l’annulation" className="champ" maxLength={500} />
          <button className="btn-danger w-full" disabled={enCours}>Annuler la mission</button>
        </form>
      </details>
      {erreur && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
    </div>
  );
}

export function Briefing({ id, le, lieu, notes }: { id: string; le: string; lieu: string; notes: string }) {
  const [erreur, action, enCours] = useActionState(enregistrerBriefing.bind(null, id), null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Date et heure</span>
          <input type="datetime-local" name="briefing_le" defaultValue={le} className="champ" required />
        </label>
        <label className="block">
          <span className="etiquette">Lieu</span>
          <input name="briefing_lieu" defaultValue={lieu} placeholder="Ex. : bureaux PROXIMA, ou appel WhatsApp" className="champ" />
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Consignes données</span>
        <textarea name="briefing_notes" rows={3} defaultValue={notes} placeholder="Tenue, matériel remis, déroulé, contacts sur place…" className="champ" />
      </label>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="btn" disabled={enCours}>{le ? 'Mettre à jour le briefing' : 'Enregistrer le briefing'}</button>
    </form>
  );
}
