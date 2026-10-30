/**
 * Regles metier des clients et des briefs (cahier des charges 5.2).
 *
 * Module pur (ni base, ni Next), teste par tests/clients.test.mjs.
 */

import { CATEGORIES_MISSIONS } from '../referentiel.ts';
import { normaliserTelephone } from '../intervenants/regles.ts';

// ------------------------------------------------------------ referentiels

export type StatutCommercial = 'prospect' | 'pilote' | 'actif' | 'recurrent';

export const STATUTS_COMMERCIAUX: Record<StatutCommercial, { libelle: string; aide: string; ton: 'neutre' | 'info' | 'ok' | 'alerte' }> = {
  prospect: { libelle: 'Prospect', aide: 'Contact en cours, aucune mission réalisée', ton: 'neutre' },
  pilote: { libelle: 'Pilote', aide: 'Première mission test', ton: 'alerte' },
  actif: { libelle: 'Client actif', aide: 'Missions en cours ou récentes', ton: 'info' },
  recurrent: { libelle: 'Client récurrent', aide: 'Commandes régulières', ton: 'ok' },
};

export type StatutBrief = 'recu' | 'converti' | 'abandonne';

export const STATUTS_BRIEF: Record<StatutBrief, { libelle: string; ton: 'neutre' | 'info' | 'ok' | 'alerte' | 'eteint' }> = {
  recu: { libelle: 'À traiter', ton: 'alerte' },
  converti: { libelle: 'Converti en mission', ton: 'ok' },
  abandonne: { libelle: 'Abandonné', ton: 'eteint' },
};

export const SECTEURS = [
  'Télécommunications',
  'Banque / microfinance',
  'Assurance',
  'Agroalimentaire',
  'Boissons',
  'Grande consommation',
  'Distribution / commerce',
  'Énergie',
  'Santé / pharmacie',
  'Médias / communication',
  'ONG / projet de développement',
  'Institution publique',
  'Autre',
];

// ------------------------------------------------------------ montants

/**
 * Lit un montant en FCFA saisi librement : « 1 500 000 », « 1.500.000 »,
 * « 1500000 FCFA ». Le franc CFA n'a pas de subdivision en usage : on
 * n'accepte que des entiers. Retourne null si vide, NaN si illisible.
 */
export function lireMontant(saisie: string): number | null {
  const s = (saisie ?? '').replace(/f\s*cfa|xof|cfa/gi, '').replace(/[\s  .,]/g, '');
  if (!s) return null;
  if (!/^\d{1,13}$/.test(s)) return NaN;
  return Number(s);
}

/** 1500000 -> « 1 500 000 FCFA » (espaces insecables, comme en typographie francaise). */
export function formaterFCFA(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`;
}

// ------------------------------------------------------------ IFU et contacts

/** IFU beninois : 13 chiffres. */
export function normaliserIFU(saisie: string): string | null {
  const s = (saisie ?? '').replace(/\s/g, '');
  return /^\d{13}$/.test(s) ? s : null;
}

/** Contact client : numero beninois normalise, ou numero international saisi avec son indicatif. */
export function normaliserTelephoneContact(saisie: string): string | null {
  const beninois = normaliserTelephone(saisie);
  if (beninois) return beninois;
  const s = (saisie ?? '').replace(/[\s.\-()/]/g, '').replace(/^00/, '+');
  return /^\+(?!229)\d{8,15}$/.test(s) ? s : null;
}

// ------------------------------------------------------------ encours

export interface Encours {
  encours: number;
  limite: number;
  /** null si aucune limite n'est fixee (0). */
  taux: number | null;
  niveau: 'ok' | 'proche' | 'depasse';
}

/**
 * Situation du client par rapport a sa limite de credit.
 * Au-dela de 80 % on previent ; au-dela de 100 % on alerte (cahier des
 * charges 5.6 : alerte en cas de depassement de la limite de credit).
 */
export function situationCredit(encours: number, limite: number): Encours {
  if (!limite) return { encours, limite, taux: null, niveau: 'ok' };
  const taux = encours / limite;
  return { encours, limite, taux, niveau: taux > 1 ? 'depasse' : taux >= 0.8 ? 'proche' : 'ok' };
}

// ------------------------------------------------------------ lecture des formulaires

interface FormLike {
  get(k: string): unknown;
  getAll(k: string): unknown[];
}

const texte = (f: FormLike, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
const optionnel = (f: FormLike, k: string, max = 200) => texte(f, k, max) || null;
const listeLibre = (f: FormLike, k: string) =>
  [...new Set(f.getAll(k).flatMap((v) => String(v).split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean))].slice(0, 30);

function entier(f: FormLike, k: string, min: number, max: number, defaut: number | null) {
  const s = texte(f, k).replace(/\s/g, '');
  if (!s) return { valeur: defaut, ok: true };
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? { valeur: n, ok: true } : { valeur: null, ok: false };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FicheClient {
  raison_sociale: string;
  secteur: string | null;
  ifu: string | null;
  ville: string | null;
  adresse_facturation: string | null;
  contact_nom: string | null;
  contact_fonction: string | null;
  contact_telephone: string | null;
  contact_email: string | null;
  conditions_paiement: string | null;
  delai_paiement_jours: number;
  acompte_pourcent: number;
  limite_credit_fcfa: number;
  statut_commercial: StatutCommercial;
  notes: string | null;
}

type Resultat<T> = { ok: true; donnees: T } | { ok: false; erreurs: Record<string, string> };

export function lireClient(f: FormLike): Resultat<FicheClient> {
  const erreurs: Record<string, string> = {};

  const ifuSaisi = texte(f, 'ifu');
  const ifu = ifuSaisi ? normaliserIFU(ifuSaisi) : null;
  if (ifuSaisi && !ifu) erreurs.ifu = 'L’IFU compte 13 chiffres.';

  const telSaisi = texte(f, 'contact_telephone');
  const tel = telSaisi ? normaliserTelephoneContact(telSaisi) : null;
  if (telSaisi && !tel) erreurs.contact_telephone = 'Numéro invalide (béninois à 10 chiffres, ou international avec indicatif).';

  const email = optionnel(f, 'contact_email')?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) erreurs.contact_email = 'Adresse e-mail invalide.';

  const limite = lireMontant(texte(f, 'limite_credit_fcfa'));
  if (Number.isNaN(limite)) erreurs.limite_credit_fcfa = 'Montant invalide (en FCFA, sans décimales).';

  const delai = entier(f, 'delai_paiement_jours', 0, 180, 30);
  if (!delai.ok) erreurs.delai_paiement_jours = 'Entre 0 et 180 jours.';
  const acompte = entier(f, 'acompte_pourcent', 0, 100, 0);
  if (!acompte.ok) erreurs.acompte_pourcent = 'Entre 0 et 100 %.';

  const statut = texte(f, 'statut_commercial') as StatutCommercial;

  const d: FicheClient = {
    raison_sociale: texte(f, 'raison_sociale', 160),
    secteur: optionnel(f, 'secteur', 80),
    ifu,
    ville: optionnel(f, 'ville', 80),
    adresse_facturation: optionnel(f, 'adresse_facturation', 400),
    contact_nom: optionnel(f, 'contact_nom', 120),
    contact_fonction: optionnel(f, 'contact_fonction', 120),
    contact_telephone: tel,
    contact_email: email,
    conditions_paiement: optionnel(f, 'conditions_paiement', 400),
    delai_paiement_jours: delai.valeur ?? 30,
    acompte_pourcent: acompte.valeur ?? 0,
    limite_credit_fcfa: limite && !Number.isNaN(limite) ? limite : 0,
    statut_commercial: statut in STATUTS_COMMERCIAUX ? statut : 'prospect',
    notes: optionnel(f, 'notes', 2000),
  };
  if (!d.raison_sociale) erreurs.raison_sociale = 'La raison sociale est obligatoire.';
  if (!d.contact_telephone && !d.contact_email) {
    erreurs.contact_telephone ??= 'Indiquez au moins un téléphone ou un e-mail de contact.';
  }

  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: d };
}

export interface FicheBrief {
  objectif: string;
  categorie: string | null;
  type_mission: string | null;
  zone: string | null;
  nb_profils: number | null;
  date_debut: string | null;
  date_fin: string | null;
  horaires: string | null;
  duree: string | null;
  competences: string[];
  budget_fcfa: number | null;
  livrables: string | null;
}

/** Valeur d'option « categorie::type » du choix de type de mission ; type vide = « autre ». */
export function valeurTypeMission(categorie: string | null, type: string | null): string {
  return categorie ? `${categorie}::${type ?? ''}` : '';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lireBrief(f: FormLike): Resultat<FicheBrief> {
  const erreurs: Record<string, string> = {};

  const [cat, type] = texte(f, 'type_mission').split('::');
  const categorie = CATEGORIES_MISSIONS.find((c) => c.code === cat);
  const typeValide = categorie && type && categorie.types.includes(type) ? type : null;

  const nb = entier(f, 'nb_profils', 1, 500, null);
  if (!nb.ok) erreurs.nb_profils = 'Entre 1 et 500 personnes.';

  const budget = lireMontant(texte(f, 'budget_fcfa'));
  if (Number.isNaN(budget)) erreurs.budget_fcfa = 'Montant invalide (en FCFA, sans décimales).';

  const debut = texte(f, 'date_debut');
  const fin = texte(f, 'date_fin');
  if (debut && !DATE.test(debut)) erreurs.date_debut = 'Date invalide.';
  if (fin && !DATE.test(fin)) erreurs.date_fin = 'Date invalide.';
  if (debut && fin && DATE.test(debut) && DATE.test(fin) && fin < debut) {
    erreurs.date_fin = 'La date de fin précède la date de début.';
  }

  const d: FicheBrief = {
    objectif: texte(f, 'objectif', 2000),
    categorie: categorie?.code ?? null,
    type_mission: typeValide,
    zone: optionnel(f, 'zone', 200),
    nb_profils: nb.valeur,
    date_debut: debut || null,
    date_fin: fin || null,
    horaires: optionnel(f, 'horaires', 120),
    duree: optionnel(f, 'duree', 120),
    competences: listeLibre(f, 'competences'),
    budget_fcfa: budget !== null && !Number.isNaN(budget) ? budget : null,
    livrables: optionnel(f, 'livrables', 2000),
  };
  if (!d.objectif) erreurs.objectif = 'Décrivez l’objectif de la mission.';
  if (!d.categorie) erreurs.type_mission = 'Choisissez le type de mission.';

  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: d };
}
