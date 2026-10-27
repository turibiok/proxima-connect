'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { enregistrerBrief, type EtatFormulaire } from '@/lib/clients/actions';
import { CATEGORIES_MISSIONS, COMPETENCES } from '@/lib/referentiel';
import { BandeauErreurs, Champ, Section } from './Champs';

/**
 * Saisie du brief client (cahier des charges 5.2) : objectif, zone, nombre
 * de profils, duree, horaires, competences, budget, livrables.
 */
export function FormulaireBrief({
  clientId,
  briefId,
  initiales = {},
}: {
  clientId: string;
  briefId: string | null;
  initiales?: Record<string, string>;
}) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(enregistrerBrief.bind(null, clientId, briefId), null);
  const e = etat?.erreurs ?? {};
  const val = (k: string) => {
    const v = etat ? etat.valeurs[k] : initiales[k];
    return typeof v === 'string' ? v : '';
  };

  return (
    <form action={action} key={etat ? JSON.stringify(etat.valeurs) : 'initial'} className="space-y-5" noValidate>
      {/* la cle reconstruit le formulaire apres un refus : React remet les champs texte
          a leur defaultValue, mais pas les listes deroulantes */}
      <BandeauErreurs erreurs={e} />

      <Section numero={1} titre="Besoin du client">
        <Champ nom="type_mission" libelle="Type de mission" erreur={e.type_mission}>
          <select id="type_mission" name="type_mission" defaultValue={val('type_mission')} className="champ" required>
            <option value="">Choisir dans le catalogue…</option>
            {CATEGORIES_MISSIONS.map((c) => (
              <optgroup key={c.code} label={c.libelle}>
                {c.types.map((t) => <option key={t} value={`${c.code}::${t}`}>{t}</option>)}
                <option value={`${c.code}::`}>Autre ({c.libelle.toLowerCase()})</option>
              </optgroup>
            ))}
          </select>
        </Champ>
        <Champ nom="objectif" libelle="Objectif" erreur={e.objectif} aide="Ce que le client veut obtenir, avec ses chiffres si possible.">
          <textarea
            id="objectif"
            name="objectif"
            rows={3}
            defaultValue={val('objectif')}
            placeholder="Ex. : relever les prix de 12 références dans 150 boutiques de Cotonou"
            className="champ"
            required
          />
        </Champ>
        <Champ nom="livrables" libelle="Livrables attendus" facultatif>
          <textarea id="livrables" name="livrables" rows={2} defaultValue={val('livrables')} placeholder="Ex. : fichier Excel des relevés, photos géolocalisées, rapport de synthèse" className="champ" />
        </Champ>
      </Section>

      <Section numero={2} titre="Où, quand, combien">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="zone" libelle="Zone" facultatif>
            <input id="zone" name="zone" defaultValue={val('zone')} placeholder="Ex. : Cotonou (Dantokpa, Ganhi), Abomey-Calavi" className="champ" />
          </Champ>
          <Champ nom="nb_profils" libelle="Nombre de personnes" erreur={e.nb_profils} facultatif>
            <input id="nb_profils" name="nb_profils" type="number" min={1} max={500} defaultValue={val('nb_profils')} className="champ" />
          </Champ>
          <Champ nom="date_debut" libelle="Début" erreur={e.date_debut} facultatif>
            <input id="date_debut" name="date_debut" type="date" defaultValue={val('date_debut')} className="champ" />
          </Champ>
          <Champ nom="date_fin" libelle="Fin" erreur={e.date_fin} facultatif>
            <input id="date_fin" name="date_fin" type="date" defaultValue={val('date_fin')} className="champ" />
          </Champ>
          <Champ nom="horaires" libelle="Horaires" facultatif>
            <input id="horaires" name="horaires" defaultValue={val('horaires')} placeholder="Ex. : 8 h – 13 h" className="champ" />
          </Champ>
          <Champ nom="duree" libelle="Durée" facultatif>
            <input id="duree" name="duree" defaultValue={val('duree')} placeholder="Ex. : 3 samedis" className="champ" />
          </Champ>
        </div>
      </Section>

      <Section numero={3} titre="Profils et budget">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="competences" libelle="Compétences recherchées" aide="Séparées par des virgules." facultatif>
            <input id="competences" name="competences" list="competences-liste" defaultValue={val('competences')} className="champ" />
            <datalist id="competences-liste">{COMPETENCES.map((c) => <option key={c} value={c} />)}</datalist>
          </Champ>
          <Champ nom="budget_fcfa" libelle="Budget du client (FCFA)" erreur={e.budget_fcfa} facultatif>
            <input id="budget_fcfa" name="budget_fcfa" inputMode="numeric" defaultValue={val('budget_fcfa')} placeholder="Ex. : 1 500 000" className="champ" />
          </Champ>
        </div>
      </Section>

      <div className="flex gap-2">
        <button className="btn-primaire px-8" disabled={enCours}>
          {enCours ? 'Enregistrement…' : briefId ? 'Enregistrer les modifications' : 'Enregistrer le brief'}
        </button>
        <Link href={briefId ? `/briefs/${briefId}` : `/clients/${clientId}`} className="btn">Annuler</Link>
      </div>
    </form>
  );
}
