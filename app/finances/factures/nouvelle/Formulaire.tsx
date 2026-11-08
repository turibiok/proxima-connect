'use client';

import { useActionState, useState } from 'react';
import { emettreFacture, type EtatFinance } from '@/lib/finances/actions';
import { formaterFCFA, lireMontant } from '@/lib/clients/regles';
import { situationCredit } from '@/lib/clients/regles';
import { TRESORERIES, TYPES_FACTURE, type Tresorerie, type TypeFacture } from '@/lib/finances/regles';

export function FormulaireFacture({
  clientId,
  missionId,
  missionLibelle,
  aujourdhui,
  suggestions,
  objetDefaut,
  encours,
  limite,
  rappel,
}: {
  clientId: string;
  missionId: string | null;
  missionLibelle: string | null;
  aujourdhui: string;
  suggestions: { type: TypeFacture; montant: Record<TypeFacture, number | null>; echeance: Record<TypeFacture, string> };
  objetDefaut: string;
  encours: number;
  limite: number;
  rappel: string;
}) {
  const [etat, action, enCours] = useActionState<EtatFinance, FormData>(emettreFacture, null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  const [type, setType] = useState<TypeFacture>((v.type as TypeFacture) ?? suggestions.type);
  const [montant, setMontant] = useState(v.montant ?? (suggestions.montant[type] ? String(suggestions.montant[type]) : ''));
  const [echeance, setEcheance] = useState(v.echeance_le ?? suggestions.echeance[type]);

  // changer de type reprend les valeurs proposees pour ce type
  const choisir = (t: TypeFacture) => {
    setType(t);
    setMontant(suggestions.montant[t] ? String(suggestions.montant[t]) : '');
    setEcheance(suggestions.echeance[t]);
  };

  const saisi = lireMontant(montant);
  const apres = situationCredit(encours + (saisi && !Number.isNaN(saisi) ? saisi : 0), limite);

  return (
    <form action={action} className="carte space-y-4 p-5">
      <input type="hidden" name="client_id" value={clientId} />
      {missionId && <input type="hidden" name="mission_id" value={missionId} />}
      <p className="text-xs text-encre-douce">{rappel}</p>

      <fieldset>
        <legend className="etiquette">Type</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPES_FACTURE) as TypeFacture[]).map((t) => (
            <label key={t} className="coche">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => choisir(t)} /> {TYPES_FACTURE[t].libelle}
            </label>
          ))}
        </div>
        {e.type && <p className="erreur">{e.type}</p>}
      </fieldset>

      <label className="block">
        <span className="etiquette">Objet</span>
        <input name="objet" defaultValue={v.objet ?? (objetDefaut ? `${type === 'acompte' ? 'Acompte : ' : ''}${objetDefaut}` : '')} key={type} maxLength={300} placeholder="Prestation facturée" className="champ" />
        {e.objet && <span className="erreur block">{e.objet}</span>}
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="etiquette">Montant (FCFA)</span>
          <input name="montant" inputMode="numeric" value={montant} onChange={(x) => setMontant(x.target.value)} className="champ" />
          {e.montant && <span className="erreur block">{e.montant}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Date d’émission</span>
          <input type="date" name="emise_le" defaultValue={v.emise_le ?? aujourdhui} max={aujourdhui} className="champ" />
          {e.emise_le && <span className="erreur block">{e.emise_le}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Échéance</span>
          <input type="date" name="echeance_le" value={echeance} onChange={(x) => setEcheance(x.target.value)} className="champ" />
          {e.echeance_le && <span className="erreur block">{e.echeance_le}</span>}
        </label>
      </div>

      {missionId ? (
        <p className="text-sm text-encre-douce">
          Mission {missionLibelle} : la facture relève de la <strong>{TRESORERIES.missions.libelle.toLowerCase()}</strong>.
        </p>
      ) : (
        <fieldset>
          <legend className="etiquette">Trésorerie</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TRESORERIES) as Tresorerie[]).map((t) => (
              <label key={t} className="coche">
                <input type="radio" name="tresorerie" value={t} defaultChecked={(v.tresorerie ?? 'administrative') === t} /> {TRESORERIES[t].libelle}
              </label>
            ))}
          </div>
          {e.tresorerie && <p className="erreur">{e.tresorerie}</p>}
        </fieldset>
      )}

      {apres.niveau !== 'ok' && (
        <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${apres.niveau === 'depasse' ? 'bg-danger-pale text-danger' : 'bg-alerte-pale text-alerte'}`}>
          {apres.niveau === 'depasse' ? 'Limite de crédit dépassée' : 'Limite de crédit bientôt atteinte'} : l’encours du client passera à {formaterFCFA(apres.encours)} pour
          une limite de {formaterFCFA(limite)}. La facture peut être émise, mais demandez un règlement avant d’engager de nouvelles missions.
        </p>
      )}

      {e.general && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}
      {e.mission_id && <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.mission_id}</p>}
      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Émission…' : `Émettre ${type === 'acompte' ? 'l’acompte' : 'la facture'}`}</button>
      <p className="text-xs text-encre-douce">Le numéro est attribué à l’émission, dans l’ordre (FA-année-0001, AC-année-0001). Une facture émise ne se supprime pas : elle s’annule, avec un motif.</p>
    </form>
  );
}
