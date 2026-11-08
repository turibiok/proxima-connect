'use client';

import { useActionState, useState } from 'react';
import { enregistrerPonderation, type EtatEvaluation } from '@/lib/score/actions';

export function FormulairePonderation({ criteres }: { criteres: { code: string; libelle: string; poids: number; calcule: boolean }[] }) {
  const [etat, action, enCours] = useActionState<EtatEvaluation, FormData>(enregistrerPonderation, null);
  const [poids, setPoids] = useState<Record<string, number>>(Object.fromEntries(criteres.map((c) => [c.code, c.poids])));
  const total = Object.values(poids).reduce((t, p) => t + (Number.isFinite(p) ? p : 0), 0);

  return (
    <form action={action} className="space-y-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-encre-douce">
          <tr>
            <th className="pb-2 font-medium">Critère</th>
            <th className="pb-2 font-medium">Poids</th>
            <th className="pb-2 text-right font-medium">Part du score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-trait">
          {criteres.map((c) => (
            <tr key={c.code}>
              <td className="py-2 pr-3">
                {c.libelle}
                <div className="text-xs text-encre-douce">{c.calcule ? 'Calculé automatiquement' : 'Noté à chaque évaluation'}</div>
              </td>
              <td className="py-2 pr-3">
                <input
                  name={c.code}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isFinite(poids[c.code]) ? poids[c.code] : ''}
                  onChange={(e) => setPoids({ ...poids, [c.code]: e.target.valueAsNumber })}
                  aria-label={`Poids : ${c.libelle}`}
                  className="champ w-24"
                />
                {etat?.erreurs?.[c.code] && <span className="erreur block">{etat.erreurs[c.code]}</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{total ? `${Math.round(((poids[c.code] || 0) / total) * 100)} %` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-encre-douce">
        Les poids sont relatifs : seule leur proportion compte. Enregistrer recalcule immédiatement le score de tous les intervenants,
        et chaque recalcul est tracé dans leur historique.
      </p>
      {/* pres du bouton : c'est la que le regard se trouve apres l'envoi */}
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {etat?.erreurs?.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{etat.erreurs.general}</p>}
      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Recalcul en cours…' : 'Enregistrer et recalculer'}</button>
    </form>
  );
}
