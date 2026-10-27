'use client';

import { useActionState, useTransition } from 'react';
import { basculerControle, changerStatut } from '@/lib/intervenants/actions';
import type { Controle } from '@/lib/intervenants/regles';
import { STATUTS_PROFIL, type StatutProfil } from '@/lib/referentiel';

export function Controles({ id, controles, modifiable }: { id: string; controles: (Controle & { par?: string | null; le?: string | null })[]; modifiable: boolean }) {
  const [enCours, demarrer] = useTransition();
  return (
    <ul className="divide-y divide-trait">
      {controles.map((c) => (
        <li key={c.code} className="flex items-center gap-3 py-2.5">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${c.ok ? 'bg-ok-pale text-ok' : 'bg-alerte-pale text-alerte'}`}
            aria-hidden
          >
            {c.ok ? '✓' : '!'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{c.libelle}</div>
            <div className="text-xs text-encre-douce">
              {c.detail}
              {c.ok && c.par && ` — par ${c.par}`}
              {c.ok && c.le && `, le ${c.le}`}
            </div>
          </div>
          {/* l'age se deduit de la date de naissance : pas de case a cocher */}
          {modifiable && c.code !== 'age' && (
            <button
              type="button"
              disabled={enCours}
              onClick={() => demarrer(() => basculerControle(id, c.code as 'identite' | 'telephone' | 'paiement', !c.ok))}
              className={c.ok ? 'btn px-3 py-1 text-xs' : 'btn-primaire px-3 py-1 text-xs'}
            >
              {c.ok ? 'Annuler' : 'Valider'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ChangementStatut({ id, possibles, verificationComplete }: { id: string; possibles: StatutProfil[]; verificationComplete: boolean }) {
  const [erreur, action, enCours] = useActionState(changerStatut.bind(null, id), null);
  if (possibles.length === 0) return null;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {possibles.map((s) => {
          const bloque = (s === 'verifie' || s === 'actif') && !verificationComplete;
          return (
            <label key={s} className={`coche ${bloque ? 'opacity-50' : ''}`} title={bloque ? 'Validez d’abord les quatre contrôles' : undefined}>
              <input type="radio" name="statut" value={s} disabled={bloque} required /> {STATUTS_PROFIL[s].libelle}
            </label>
          );
        })}
      </div>
      <input name="motif" placeholder="Motif (obligatoire pour suspendre ou désactiver)" className="champ" maxLength={500} />
      {erreur && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{erreur}</p>}
      <button className="btn-primaire" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Changer le statut'}
      </button>
    </form>
  );
}
