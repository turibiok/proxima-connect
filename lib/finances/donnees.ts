import 'server-only';
import { requete, une } from '@/lib/db';
import { DELAI_PAIEMENT, RETARD_IMPORTANT_JOURS, type Tresorerie } from './regles';

/** Lectures communes a la vue d'ensemble des finances et au tableau de bord. */

export interface SynthesePaiements {
  verse: number;
  a_verser: number;
  a_payer: number;
  litiges: number;
  /** A payer depuis plus de 72 h. */
  en_retard: number;
  /** A payer depuis 48 a 72 h : a verser sans tarder. */
  urgents: number;
  /** Delai median validation -> paiement sur 90 jours, en heures. */
  delai_median: number | null;
  payes_90: number;
  dans_delai_90: number;
}

export function synthesePaiements() {
  return une<SynthesePaiements>(
    `SELECT coalesce(sum(montant_fcfa) FILTER (WHERE statut = 'paye'), 0)::bigint AS verse,
            coalesce(sum(montant_fcfa) FILTER (WHERE statut <> 'paye'), 0)::bigint AS a_verser,
            count(*) FILTER (WHERE statut = 'a_payer')::int AS a_payer,
            count(*) FILTER (WHERE statut = 'en_litige')::int AS litiges,
            count(*) FILTER (WHERE statut = 'a_payer' AND du_depuis < now() - make_interval(hours => $2))::int AS en_retard,
            count(*) FILTER (WHERE statut = 'a_payer' AND du_depuis < now() - make_interval(hours => $1)
                               AND du_depuis >= now() - make_interval(hours => $2))::int AS urgents,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM paye_le - du_depuis) / 3600)
               FILTER (WHERE statut = 'paye' AND paye_le > now() - interval '90 days'))::float AS delai_median,
            count(*) FILTER (WHERE statut = 'paye' AND paye_le > now() - interval '90 days')::int AS payes_90,
            count(*) FILTER (WHERE statut = 'paye' AND paye_le > now() - interval '90 days'
                               AND paye_le - du_depuis <= make_interval(hours => $2))::int AS dans_delai_90
       FROM paiement_intervenant`,
    [DELAI_PAIEMENT.cible, DELAI_PAIEMENT.limite],
  ) as Promise<SynthesePaiements>;
}

export interface SyntheseTresorerie {
  tresorerie: Tresorerie;
  encaisse: number;
  a_encaisser: number;
  echu: number;
}

/** Encaissements par tresorerie (factures non annulees). */
export function syntheseFactures(aujourdhui: string) {
  return requete<SyntheseTresorerie>(
    `SELECT tresorerie,
            coalesce(sum(montant_regle_fcfa), 0)::bigint AS encaisse,
            coalesce(sum(montant_fcfa - montant_regle_fcfa) FILTER (WHERE statut IN ('emise', 'partielle')), 0)::bigint AS a_encaisser,
            coalesce(sum(montant_fcfa - montant_regle_fcfa) FILTER (WHERE statut IN ('emise', 'partielle') AND echeance_le < $1::date), 0)::bigint AS echu
       FROM facture WHERE statut <> 'annulee' GROUP BY tresorerie`,
    [aujourdhui],
  );
}

/** Factures en retard important (au-dela du seuil apres l'echeance). */
export function facturesEnRetard(aujourdhui: string, limite = 10) {
  return requete<{ id: string; numero: string; client_id: string; raison_sociale: string; reste: number; echeance_le: string; jours: number }>(
    `SELECT f.id, f.numero, f.client_id, c.raison_sociale, (f.montant_fcfa - f.montant_regle_fcfa)::bigint AS reste, f.echeance_le,
            ($1::date - f.echeance_le)::int AS jours
       FROM facture f JOIN client c ON c.id = f.client_id
      WHERE f.statut IN ('emise', 'partielle') AND f.echeance_le < $1::date - $2::int
      ORDER BY f.echeance_le LIMIT $3`,
    [aujourdhui, RETARD_IMPORTANT_JOURS, limite],
  );
}

/** Clients dont l'encours atteint 80 % de la limite de credit, ou la depasse. */
export function clientsAuxLimites() {
  return requete<{ id: string; raison_sociale: string; limite: number; encours: number }>(
    `SELECT c.id, c.raison_sociale, c.limite_credit_fcfa AS limite, sum(f.montant_fcfa - f.montant_regle_fcfa)::bigint AS encours
       FROM client c JOIN facture f ON f.client_id = c.id AND f.statut IN ('emise', 'partielle')
      WHERE c.limite_credit_fcfa > 0
      GROUP BY c.id
     HAVING sum(f.montant_fcfa - f.montant_regle_fcfa) >= 0.8 * c.limite_credit_fcfa
      ORDER BY sum(f.montant_fcfa - f.montant_regle_fcfa)::float / c.limite_credit_fcfa DESC`,
  );
}

/** Paiements d'intervenants a verser depuis plus de 48 h, les plus anciens d'abord. */
export function paiementsEnAttente(limite = 10) {
  return requete<{ id: string; intervenant_id: string; nom: string; prenoms: string; mission_id: string; reference: string; montant_fcfa: number; du_depuis: Date }>(
    `SELECT p.id, p.intervenant_id, i.nom, i.prenoms, p.mission_id, m.reference, p.montant_fcfa, p.du_depuis
       FROM paiement_intervenant p JOIN intervenant i ON i.id = p.intervenant_id JOIN mission m ON m.id = p.mission_id
      WHERE p.statut = 'a_payer' AND p.du_depuis < now() - make_interval(hours => $1)
      ORDER BY p.du_depuis LIMIT $2`,
    [DELAI_PAIEMENT.cible, limite],
  );
}
