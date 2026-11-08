'use client';

import { CRITERES_NOTES, ECHELLE, type Notes } from '@/lib/score/regles';

/**
 * Saisie des notes de 1 a 5 par critere : boutons radio, utilisables au
 * doigt sur telephone et sans JavaScript.
 */
export function SaisieNotes({ initiales = {}, erreurs = {} }: { initiales?: Notes | Record<string, string>; erreurs?: Record<string, string> }) {
  return (
    <div className="space-y-3">
      {CRITERES_NOTES.map((c) => {
        const actuelle = String((initiales as Record<string, unknown>)[c.code] ?? '');
        return (
          <fieldset key={c.code}>
            <legend className="text-sm font-medium">
              {c.libelle}
              {c.facultatif && <span className="font-normal text-encre-douce"> (facultatif)</span>}
              <span className="block text-xs font-normal text-encre-douce">{c.aide}</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="coche px-2.5 py-1.5" title={ECHELLE[n]}>
                  <input type="radio" name={c.code} value={n} defaultChecked={actuelle === String(n)} />
                  <span className="tabular-nums">{n}</span>
                  <span className="hidden text-xs text-encre-douce sm:inline">{ECHELLE[n]}</span>
                </label>
              ))}
              {c.facultatif && (
                <label className="coche px-2.5 py-1.5">
                  <input type="radio" name={c.code} value="" defaultChecked={!actuelle} />
                  <span className="text-xs">Pas d’avis</span>
                </label>
              )}
            </div>
            {erreurs[c.code] && <p className="erreur">{erreurs[c.code]}</p>}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Notes d'une evaluation, en ligne compacte. */
export function ResumeNotes({ notes }: { notes: Notes }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {CRITERES_NOTES.map((c) => {
        const n = notes[c.code];
        return (
          <span
            key={c.code}
            className={`puce ${typeof n !== 'number' ? 'bg-papier text-encre-douce' : n <= 2 ? 'bg-danger-pale text-danger' : n >= 4 ? 'bg-ok-pale text-ok' : 'bg-marque-pale text-marque-fonce'}`}
          >
            {c.libelle} : {typeof n === 'number' ? `${n}/5` : 'pas d’avis'}
          </span>
        );
      })}
    </div>
  );
}
