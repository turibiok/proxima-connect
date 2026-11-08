import 'server-only';
import type { Droit } from '@/lib/auth/roles';
import { date, dateHeure } from '@/lib/format';
import { STATUTS_PROFIL, libelleCategorie, type StatutProfil } from '@/lib/referentiel';
import { STATUTS_COMMERCIAUX, type StatutCommercial } from '@/lib/clients/regles';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';
import { MODES_PAIEMENT, STATUTS_FACTURE, STATUTS_PAIEMENT, TRESORERIES, TYPES_FACTURE, type ModePaiement, type StatutFacture, type StatutPaiement, type Tresorerie, type TypeFacture } from '@/lib/finances/regles';
import type { Colonne } from './regles';

/**
 * Jeux de donnees exportables en CSV (cahier des charges 5.7 : export pour
 * analyses ponctuelles). Chaque jeu exige le droit de lecture de ce qu'il
 * contient.
 *
 * Minimisation (8.1) : aucun export ne contient de numero de piece, de
 * coordonnees de paiement, de telephone ni d'adresse e-mail d'intervenant.
 * Une analyse n'en a pas besoin, et un fichier exporte echappe aux controles
 * d'acces du programme.
 */

type L = Record<string, any>;

export interface JeuExport {
  libelle: string;
  description: string;
  droit: Droit;
  sql: string;
  colonnes: Colonne<L>[];
}

const age = (naissance: string) => {
  const n = new Date(`${naissance}T12:00:00Z`);
  const a = new Date();
  let ans = a.getUTCFullYear() - n.getUTCFullYear();
  if (a.getUTCMonth() < n.getUTCMonth() || (a.getUTCMonth() === n.getUTCMonth() && a.getUTCDate() < n.getUTCDate())) ans--;
  return ans;
};
const liste = (v: string[] | null) => (v ?? []).join(', ');
const jour = (v: string | Date | null) => (v ? date(v) : null);

export const JEUX: Record<string, JeuExport> = {
  intervenants: {
    libelle: 'Intervenants',
    description: 'Profils, localisation, compétences, statut, score et missions réalisées. Sans téléphone, pièce ni compte de paiement.',
    droit: 'profil:lire',
    sql: `SELECT i.reference, i.nom, i.prenoms, i.sexe, i.date_naissance, i.ville, i.quartier, i.zones, i.niveau_etudes, i.situation,
                 i.competences, i.langues, i.categories_missions, i.jours_disponibles, i.deplacements, i.statut, i.score, i.source, i.cree_le,
                 (SELECT count(*) FROM affectation a WHERE a.intervenant_id = i.id AND a.role = 'titulaire' AND a.presence IN ('present', 'retard'))::int AS missions
            FROM intervenant i ORDER BY i.reference`,
    colonnes: [
      { libelle: 'Référence', valeur: (l) => l.reference },
      { libelle: 'Nom', valeur: (l) => l.nom },
      { libelle: 'Prénoms', valeur: (l) => l.prenoms },
      { libelle: 'Sexe', valeur: (l) => l.sexe },
      { libelle: 'Âge', valeur: (l) => age(l.date_naissance) },
      { libelle: 'Ville', valeur: (l) => l.ville },
      { libelle: 'Quartier', valeur: (l) => l.quartier },
      { libelle: 'Zones acceptées', valeur: (l) => liste(l.zones) },
      { libelle: 'Niveau d’études', valeur: (l) => l.niveau_etudes },
      { libelle: 'Situation', valeur: (l) => l.situation },
      { libelle: 'Compétences', valeur: (l) => liste(l.competences) },
      { libelle: 'Langues', valeur: (l) => liste(l.langues) },
      { libelle: 'Types de missions', valeur: (l) => (l.categories_missions ?? []).map(libelleCategorie).join(', ') },
      { libelle: 'Jours disponibles', valeur: (l) => liste(l.jours_disponibles) },
      { libelle: 'Déplacements', valeur: (l) => liste(l.deplacements) },
      { libelle: 'Statut', valeur: (l) => STATUTS_PROFIL[l.statut as StatutProfil]?.libelle ?? l.statut },
      { libelle: 'Score', valeur: (l) => l.score },
      { libelle: 'Missions réalisées', valeur: (l) => l.missions },
      { libelle: 'Source', valeur: (l) => (l.source === 'formulaire' ? 'Formulaire public' : 'Saisie interne') },
      { libelle: 'Inscrit le', valeur: (l) => jour(l.cree_le) },
    ],
  },
  missions: {
    libelle: 'Missions',
    description: 'Une ligne par mission : client, étape, équipe, présence, preuves, budget, rapport et avis du client.',
    droit: 'mission:lire',
    sql: `SELECT m.reference, m.titre, c.raison_sociale, m.categorie, m.type_mission, m.zone, m.date_debut, m.date_fin, m.statut,
                 m.nb_profils_requis, m.budget_fcfa, m.remuneration_agent_fcfa, m.rapport_transmis_le, m.satisfaction_note,
                 (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.role = 'titulaire' AND a.reponse = 'accepte'
                     AND NOT EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id))::int AS engages,
                 (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.role = 'titulaire' AND a.presence IS NOT NULL)::int AS pointes,
                 (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.role = 'titulaire' AND a.presence IN ('present', 'retard'))::int AS presents,
                 (SELECT count(*) FROM preuve p WHERE p.mission_id = m.id AND p.statut = 'validee')::int AS validees,
                 (SELECT count(*) FROM preuve p WHERE p.mission_id = m.id AND p.statut = 'rejetee')::int AS rejetees,
                 (SELECT count(*) FROM incident n WHERE n.mission_id = m.id)::int AS incidents
            FROM mission m JOIN client c ON c.id = m.client_id ORDER BY m.reference`,
    colonnes: [
      { libelle: 'Référence', valeur: (l) => l.reference },
      { libelle: 'Titre', valeur: (l) => l.titre },
      { libelle: 'Client', valeur: (l) => l.raison_sociale },
      { libelle: 'Catégorie', valeur: (l) => libelleCategorie(l.categorie) },
      { libelle: 'Type', valeur: (l) => l.type_mission },
      { libelle: 'Zone', valeur: (l) => l.zone },
      { libelle: 'Début', valeur: (l) => jour(l.date_debut) },
      { libelle: 'Fin', valeur: (l) => jour(l.date_fin) },
      { libelle: 'Étape', valeur: (l) => LIBELLES_STATUT_MISSION[l.statut as StatutMission] },
      { libelle: 'Profils requis', valeur: (l) => l.nb_profils_requis },
      { libelle: 'Engagés', valeur: (l) => l.engages },
      { libelle: 'Taux de présence (%)', valeur: (l) => (l.pointes ? Math.round((l.presents / l.pointes) * 1000) / 10 : null) },
      { libelle: 'Preuves validées', valeur: (l) => l.validees },
      { libelle: 'Preuves rejetées', valeur: (l) => l.rejetees },
      { libelle: 'Incidents', valeur: (l) => l.incidents },
      { libelle: 'Budget (FCFA)', valeur: (l) => l.budget_fcfa },
      { libelle: 'Rémunération par intervenant (FCFA)', valeur: (l) => l.remuneration_agent_fcfa },
      { libelle: 'Rapport transmis le', valeur: (l) => jour(l.rapport_transmis_le) },
      { libelle: 'Avis du client (sur 5)', valeur: (l) => l.satisfaction_note },
    ],
  },
  clients: {
    libelle: 'Clients',
    description: 'Fiches clients avec conditions de paiement, encours, chiffre facturé et nombre de missions.',
    droit: 'client:lire',
    sql: `SELECT c.raison_sociale, c.secteur, c.ville, c.ifu, c.statut_commercial, c.delai_paiement_jours, c.acompte_pourcent, c.limite_credit_fcfa, c.cree_le,
                 (SELECT count(*) FROM mission m WHERE m.client_id = c.id AND m.statut <> 'annulee')::int AS missions,
                 (SELECT coalesce(sum(montant_fcfa), 0) FROM facture f WHERE f.client_id = c.id AND f.statut <> 'annulee' AND f.type <> 'devis')::bigint AS facture,
                 (SELECT coalesce(sum(montant_fcfa - montant_regle_fcfa), 0) FROM facture f WHERE f.client_id = c.id AND f.statut IN ('emise', 'partielle'))::bigint AS encours
            FROM client c ORDER BY lower(c.raison_sociale)`,
    colonnes: [
      { libelle: 'Raison sociale', valeur: (l) => l.raison_sociale },
      { libelle: 'Secteur', valeur: (l) => l.secteur },
      { libelle: 'Ville', valeur: (l) => l.ville },
      { libelle: 'IFU', valeur: (l) => l.ifu },
      { libelle: 'Statut commercial', valeur: (l) => STATUTS_COMMERCIAUX[l.statut_commercial as StatutCommercial]?.libelle },
      { libelle: 'Missions', valeur: (l) => l.missions },
      { libelle: 'Facturé (FCFA)', valeur: (l) => l.facture },
      { libelle: 'Encours (FCFA)', valeur: (l) => l.encours },
      { libelle: 'Limite de crédit (FCFA)', valeur: (l) => l.limite_credit_fcfa || null },
      { libelle: 'Délai de paiement (jours)', valeur: (l) => l.delai_paiement_jours },
      { libelle: 'Acompte (%)', valeur: (l) => l.acompte_pourcent },
      { libelle: 'Client depuis le', valeur: (l) => jour(l.cree_le) },
    ],
  },
  evaluations: {
    libelle: 'Évaluations',
    description: 'Notes de chaque intervenant par mission (1 à 5), avec les contestations et leur issue.',
    droit: 'profil:lire',
    sql: `SELECT i.reference AS intervenant, i.nom, i.prenoms, m.reference AS mission, e.notes, e.evaluee_le, e.contestee_le, e.contestation_issue
            FROM evaluation e JOIN intervenant i ON i.id = e.intervenant_id JOIN mission m ON m.id = e.mission_id
           ORDER BY e.evaluee_le DESC`,
    colonnes: [
      { libelle: 'Intervenant', valeur: (l) => l.intervenant },
      { libelle: 'Nom', valeur: (l) => `${l.nom} ${l.prenoms}` },
      { libelle: 'Mission', valeur: (l) => l.mission },
      { libelle: 'Ponctualité', valeur: (l) => l.notes?.ponctualite },
      { libelle: 'Qualité', valeur: (l) => l.notes?.qualite },
      { libelle: 'Consignes', valeur: (l) => l.notes?.consignes },
      { libelle: 'Exactitude', valeur: (l) => l.notes?.exactitude },
      { libelle: 'Comportement', valeur: (l) => l.notes?.comportement },
      { libelle: 'Avis du client', valeur: (l) => l.notes?.client },
      { libelle: 'Évaluée le', valeur: (l) => jour(l.evaluee_le) },
      { libelle: 'Contestée', valeur: (l) => (l.contestee_le ? 'oui' : 'non') },
      { libelle: 'Issue', valeur: (l) => ({ maintenue: 'Maintenue', corrigee: 'Corrigée', annulee: 'Annulée' } as L)[l.contestation_issue] ?? null },
    ],
  },
  paiements: {
    libelle: 'Paiements des intervenants',
    description: 'Montants dus et versés, délai depuis la validation, mode et référence de transaction (pour le rapprochement). Sans compte bénéficiaire.',
    droit: 'finance:lire',
    sql: `SELECT m.reference AS mission, i.reference AS intervenant, i.nom, i.prenoms, p.montant_fcfa, p.montant_initial_fcfa, p.statut,
                 p.du_depuis, p.paye_le, p.mode, p.reference_transaction,
                 floor(extract(epoch FROM coalesce(p.paye_le, now()) - p.du_depuis) / 3600)::int AS heures
            FROM paiement_intervenant p JOIN mission m ON m.id = p.mission_id JOIN intervenant i ON i.id = p.intervenant_id
           ORDER BY p.du_depuis DESC`,
    colonnes: [
      { libelle: 'Mission', valeur: (l) => l.mission },
      { libelle: 'Intervenant', valeur: (l) => l.intervenant },
      { libelle: 'Nom', valeur: (l) => `${l.nom} ${l.prenoms}` },
      { libelle: 'Montant (FCFA)', valeur: (l) => l.montant_fcfa },
      { libelle: 'Montant initial (FCFA)', valeur: (l) => l.montant_initial_fcfa },
      { libelle: 'Statut', valeur: (l) => STATUTS_PAIEMENT[l.statut as StatutPaiement]?.libelle },
      { libelle: 'Mission validée le', valeur: (l) => dateHeure(l.du_depuis) },
      { libelle: 'Payé le', valeur: (l) => (l.paye_le ? dateHeure(l.paye_le) : null) },
      { libelle: 'Délai (heures)', valeur: (l) => l.heures },
      { libelle: 'Mode', valeur: (l) => (l.mode ? MODES_PAIEMENT[l.mode as ModePaiement] : null) },
      { libelle: 'Référence de transaction', valeur: (l) => l.reference_transaction },
    ],
  },
  geopoints: {
    libelle: 'Points relevés (géopoints)',
    description: 'Points GPS validés des missions, avec la commune, la mission et la date : à ouvrir dans QGIS ou un tableur. Sans nom d’intervenant.',
    droit: 'mission:lire',
    sql: `SELECT x.latitude, x.longitude, x.precision_m, x.type, coalesce(x.realisee_le, x.saisie_le) AS quand, x.description,
                 m.reference, m.titre, m.categorie, m.commune, m.departement, c.raison_sociale
            FROM preuve x JOIN mission m ON m.id = x.mission_id JOIN client c ON c.id = m.client_id
           WHERE x.statut = 'validee' AND x.latitude IS NOT NULL AND x.longitude IS NOT NULL AND m.statut <> 'annulee'
           ORDER BY quand DESC`,
    colonnes: [
      // coordonnees en notation decimale a point : lues telles quelles par les logiciels de cartographie
      { libelle: 'latitude', valeur: (l) => String(l.latitude) },
      { libelle: 'longitude', valeur: (l) => String(l.longitude) },
      { libelle: 'Précision (m)', valeur: (l) => l.precision_m },
      { libelle: 'Type de preuve', valeur: (l) => l.type },
      { libelle: 'Relevé le', valeur: (l) => dateHeure(l.quand) },
      { libelle: 'Description', valeur: (l) => l.description },
      { libelle: 'Mission', valeur: (l) => l.reference },
      { libelle: 'Titre', valeur: (l) => l.titre },
      { libelle: 'Type de mission', valeur: (l) => libelleCategorie(l.categorie) },
      { libelle: 'Commune', valeur: (l) => l.commune },
      { libelle: 'Département', valeur: (l) => l.departement },
      { libelle: 'Client', valeur: (l) => l.raison_sociale },
    ],
  },
  factures: {
    libelle: 'Factures et acomptes',
    description: 'Numéro, client, mission, trésorerie, montants réglés et restants, échéances et statut.',
    droit: 'finance:lire',
    sql: `SELECT f.numero, f.type, c.raison_sociale, m.reference AS mission, f.tresorerie, f.objet, f.montant_fcfa, f.montant_regle_fcfa,
                 f.emise_le, f.echeance_le, f.statut
            FROM facture f JOIN client c ON c.id = f.client_id LEFT JOIN mission m ON m.id = f.mission_id
           WHERE f.type <> 'devis' ORDER BY f.emise_le DESC, f.numero DESC`,
    colonnes: [
      { libelle: 'Numéro', valeur: (l) => l.numero },
      { libelle: 'Type', valeur: (l) => TYPES_FACTURE[l.type as TypeFacture]?.libelle },
      { libelle: 'Client', valeur: (l) => l.raison_sociale },
      { libelle: 'Mission', valeur: (l) => l.mission },
      { libelle: 'Trésorerie', valeur: (l) => TRESORERIES[l.tresorerie as Tresorerie]?.libelle },
      { libelle: 'Objet', valeur: (l) => l.objet },
      { libelle: 'Montant (FCFA)', valeur: (l) => l.montant_fcfa },
      { libelle: 'Réglé (FCFA)', valeur: (l) => l.montant_regle_fcfa },
      { libelle: 'Reste dû (FCFA)', valeur: (l) => (l.statut === 'annulee' ? 0 : l.montant_fcfa - l.montant_regle_fcfa) },
      { libelle: 'Émise le', valeur: (l) => jour(l.emise_le) },
      { libelle: 'Échéance', valeur: (l) => jour(l.echeance_le) },
      { libelle: 'Statut', valeur: (l) => STATUTS_FACTURE[l.statut as StatutFacture]?.libelle },
    ],
  },
};
