/**
 * Listes de valeurs du programme.
 *
 * Centralisees ici pour que le formulaire public, les filtres du back-office
 * et la validation serveur parlent exactement le meme vocabulaire. Les codes
 * (cles) sont stockes en base ; les libelles ne servent qu'a l'affichage et
 * peuvent changer sans migration.
 *
 * Module pur, sans import : utilisable sous Node par les tests.
 */

export type Option = { code: string; libelle: string };

/** Catalogue des missions : Annexe A du cahier des charges. */
export const CATEGORIES_MISSIONS: (Option & { types: string[] })[] = [
  {
    code: 'distribution',
    libelle: 'Distribution',
    types: [
      'Distribution de flyers',
      "Distribution d'échantillons",
      'Distribution de produits',
      'Porte-à-porte',
      'Dépôt de prospectus',
      'Distribution dans marchés et boutiques',
    ],
  },
  {
    code: 'commercial',
    libelle: 'Commercial',
    types: [
      'Prospection B2B/B2C',
      'Prise de rendez-vous',
      'Recherche de prospects',
      'Prise de commandes',
      'Acquisition de clients',
      "Activation d'utilisateurs",
      'Suivi commercial',
    ],
  },
  {
    code: 'promotion',
    libelle: 'Promotion et marketing',
    types: [
      'Animation commerciale',
      'Démonstration',
      'Échantillonnage autorisé',
      'Lancement de produit',
      'Street marketing',
      'Merchandising',
      'Événementiel',
    ],
  },
  {
    code: 'enquetes',
    libelle: 'Enquêtes et collecte de données',
    types: [
      'Sondages',
      'Enquêtes consommateurs',
      'Relevés de prix',
      'Relevés de disponibilité',
      'Cartographie',
      'Études de marché',
      'Enquêtes de satisfaction',
    ],
  },
  {
    code: 'controle',
    libelle: 'Contrôle terrain',
    types: [
      'Audit de points de vente',
      'Mystery shopping',
      'Contrôle de prix',
      'Contrôle de visibilité',
      'Contrôle de merchandising',
      'Vérification de présence produit',
    ],
  },
  {
    code: 'speciales',
    libelle: 'Missions spéciales',
    types: [
      'Recensement',
      'Sensibilisation',
      "Collecte d'informations",
      'Appui aux ONG',
      'Appui aux événements',
      'Identification de commerces',
    ],
  },
];

/** Principales villes ; la saisie reste libre pour les autres localites. */
export const VILLES = [
  'Cotonou',
  'Abomey-Calavi',
  'Porto-Novo',
  'Sèmè-Podji',
  'Ouidah',
  'Allada',
  'Lokossa',
  'Abomey',
  'Bohicon',
  'Parakou',
  'Djougou',
  'Natitingou',
  'Kandi',
  'Malanville',
];

export const SITUATIONS: Option[] = [
  { code: 'etudiant', libelle: 'Étudiant(e)' },
  { code: 'diplome', libelle: "Diplômé(e) en recherche d'emploi" },
  { code: 'salarie', libelle: 'Salarié(e)' },
  { code: 'independant', libelle: 'Indépendant(e) / à son compte' },
  { code: 'agent_terrain', libelle: 'Agent de terrain' },
  { code: 'autre', libelle: 'Autre' },
];

export const NIVEAUX_ETUDES: Option[] = [
  { code: 'cep', libelle: 'CEP' },
  { code: 'bepc', libelle: 'BEPC' },
  { code: 'bac', libelle: 'BAC' },
  { code: 'bac2', libelle: 'BAC + 2 (BTS, DUT…)' },
  { code: 'licence', libelle: 'Licence' },
  { code: 'master', libelle: 'Master et plus' },
  { code: 'autre', libelle: 'Autre / formation professionnelle' },
];

export const LANGUES = ['Français', 'Fon', 'Yoruba', 'Goun', 'Mina', 'Adja', 'Bariba', 'Dendi', 'Anglais'];

export const DEPLACEMENTS: Option[] = [
  { code: 'pied', libelle: 'À pied' },
  { code: 'moto', libelle: 'Moto personnelle' },
  { code: 'vehicule', libelle: 'Véhicule' },
  { code: 'transport', libelle: 'Transport en commun / zémidjan' },
];

export const JOURS: Option[] = [
  { code: 'lun', libelle: 'Lundi' },
  { code: 'mar', libelle: 'Mardi' },
  { code: 'mer', libelle: 'Mercredi' },
  { code: 'jeu', libelle: 'Jeudi' },
  { code: 'ven', libelle: 'Vendredi' },
  { code: 'sam', libelle: 'Samedi' },
  { code: 'dim', libelle: 'Dimanche' },
];

export const CRENEAUX: Option[] = [
  { code: 'matin', libelle: 'Matin' },
  { code: 'apres_midi', libelle: 'Après-midi' },
  { code: 'soir', libelle: 'Soir' },
];

export const PIECES: Option[] = [
  { code: 'cni', libelle: "Carte d'identité" },
  { code: 'cip', libelle: 'Certificat d’identification personnelle (CIP)' },
  { code: 'passeport', libelle: 'Passeport' },
  { code: 'permis', libelle: 'Permis de conduire' },
  { code: 'carte_etudiant', libelle: "Carte d'étudiant" },
];

export const OPERATEURS_MOBILE_MONEY = ['MTN MoMo', 'Moov Money', 'Celtiis Cash'];

export const COMPETENCES = [
  'Vente',
  'Prise de parole',
  'Animation',
  'Saisie sur smartphone',
  'Enquête / questionnaire',
  'Négociation',
  'Service client',
  'Photographie',
  'Conduite moto',
  'Merchandising',
  'Informatique',
];

// ------------------------------------------------------------ statuts de profil

export type StatutProfil = 'en_attente' | 'verifie' | 'actif' | 'suspendu' | 'inactif';

export const STATUTS_PROFIL: Record<StatutProfil, { libelle: string; ton: 'neutre' | 'info' | 'ok' | 'alerte' | 'eteint' }> = {
  en_attente: { libelle: 'En attente', ton: 'alerte' },
  verifie: { libelle: 'Vérifié', ton: 'info' },
  actif: { libelle: 'Actif', ton: 'ok' },
  suspendu: { libelle: 'Suspendu', ton: 'alerte' },
  inactif: { libelle: 'Inactif', ton: 'eteint' },
};

export function libelle(liste: Option[], code: string | null | undefined): string {
  if (!code) return '-';
  return liste.find((o) => o.code === code)?.libelle ?? code;
}

export function libelleCategorie(code: string): string {
  return CATEGORIES_MISSIONS.find((c) => c.code === code)?.libelle ?? code;
}
