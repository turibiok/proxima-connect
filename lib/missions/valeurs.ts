/** Valeurs initiales (texte) du formulaire mission : depuis un brief, ou depuis une mission existante. */

import { valeurTypeMission } from '../clients/regles.ts';
import { libelleCategorie } from '../referentiel.ts';

const t = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function valeursDepuisBrief(b: Record<string, any>): Record<string, string> {
  return {
    client_id: t(b.client_id),
    titre: `${b.type_mission ?? (b.categorie ? libelleCategorie(b.categorie) : 'Mission')} pour ${b.raison_sociale}`,
    type_mission: valeurTypeMission(b.categorie, b.type_mission),
    zone: t(b.zone),
    date_debut: t(b.date_debut),
    date_fin: t(b.date_fin),
    horaires: t(b.horaires),
    nb_profils_requis: t(b.nb_profils ?? 1),
    budget_fcfa: t(b.budget_fcfa),
    objectifs: t(b.objectif),
    livrables: t(b.livrables),
    competences: (b.competences ?? []).join(', '),
  };
}

export function valeursMission(m: Record<string, any>): Record<string, string> {
  return {
    client_id: t(m.client_id),
    titre: t(m.titre),
    type_mission: valeurTypeMission(m.categorie, m.type_mission),
    zone: t(m.zone),
    lieu: t(m.lieu),
    date_debut: t(m.date_debut),
    date_fin: t(m.date_fin),
    horaires: t(m.horaires),
    nb_profils_requis: t(m.nb_profils_requis),
    remuneration_agent_fcfa: t(m.remuneration_agent_fcfa),
    budget_fcfa: t(m.budget_fcfa),
    objectifs: t(m.objectifs),
    livrables: t(m.livrables),
    competences: (m.competences ?? []).join(', '),
    score_minimum: t(m.score_minimum),
    responsable_id: t(m.responsable_id),
  };
}
