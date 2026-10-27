/**
 * Conversion d'une ligne de base en valeurs initiales de formulaire (texte).
 * Le formulaire de modification reprend ainsi exactement ce qui est enregistre.
 */

import { afficherTelephone } from '../intervenants/regles.ts';
import { valeurTypeMission } from './regles.ts';

const t = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function valeursClient(c: Record<string, any>): Record<string, string> {
  return {
    raison_sociale: t(c.raison_sociale),
    secteur: t(c.secteur),
    ifu: t(c.ifu),
    ville: t(c.ville),
    statut_commercial: t(c.statut_commercial),
    contact_nom: t(c.contact_nom),
    contact_fonction: t(c.contact_fonction),
    contact_telephone: c.contact_telephone?.startsWith('+229') ? afficherTelephone(c.contact_telephone) : t(c.contact_telephone),
    contact_email: t(c.contact_email),
    adresse_facturation: t(c.adresse_facturation),
    delai_paiement_jours: t(c.delai_paiement_jours),
    acompte_pourcent: t(c.acompte_pourcent),
    limite_credit_fcfa: t(c.limite_credit_fcfa),
    conditions_paiement: t(c.conditions_paiement),
    notes: t(c.notes),
  };
}

export function valeursBrief(b: Record<string, any>): Record<string, string> {
  return {
    type_mission: valeurTypeMission(b.categorie, b.type_mission),
    objectif: t(b.objectif),
    livrables: t(b.livrables),
    zone: t(b.zone),
    nb_profils: t(b.nb_profils),
    date_debut: t(b.date_debut),
    date_fin: t(b.date_fin),
    horaires: t(b.horaires),
    duree: t(b.duree),
    competences: (b.competences ?? []).join(', '),
    budget_fcfa: t(b.budget_fcfa),
  };
}
