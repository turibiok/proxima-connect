/**
 * Regles metier des paiements et de la facturation (cahier des charges 5.6).
 *
 * Module pur, teste par tests/finances.test.mjs : paiements dus aux
 * intervenants et delai de 48 a 72 h, factures et acomptes clients,
 * echeances et retards, saisie des paiements et des reglements.
 */

import { lireMontant } from '../clients/regles.ts';

// ------------------------------------------------------------ dates

/** Date du jour au Benin (UTC+1 toute l'annee), en AAAA-MM-JJ. */
export function aujourdhuiBenin(maintenant = new Date()): string {
  return new Date(maintenant.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/** « 2026-11-08 » + 30 jours -> « 2026-12-08 ». */
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours de `de` a `a` (dates AAAA-MM-JJ). */
export function joursEntre(de: string, a: string): number {
  return Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000);
}

/** Saisie « datetime-local » (heure du Benin) -> Date ; null si illisible. */
export function lireDateHeure(saisie: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(saisie)) return null;
  const d = new Date(`${saisie}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date -> valeur d'un champ « datetime-local » a l'heure du Benin. */
export function versSaisieDateHeure(d: Date): string {
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 16);
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const jourValide = (s: string) => JOUR.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime()) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

// ------------------------------------------------------------ paiements des intervenants

export type StatutPaiement = 'a_payer' | 'paye' | 'en_litige';

export const STATUTS_PAIEMENT: Record<StatutPaiement, { libelle: string; ton: 'alerte' | 'ok' | 'danger' }> = {
  a_payer: { libelle: 'À payer', ton: 'alerte' },
  paye: { libelle: 'Payé', ton: 'ok' },
  en_litige: { libelle: 'En litige', ton: 'danger' },
};

export type ModePaiement = 'mobile_money' | 'virement' | 'especes';

export const MODES_PAIEMENT: Record<ModePaiement, string> = {
  mobile_money: 'Mobile Money',
  virement: 'Virement bancaire',
  especes: 'Espèces',
};

/** Moyen de paiement de la fiche intervenant -> mode propose par defaut. */
export function modeParDefaut(paiementMode: string | null): ModePaiement {
  return paiementMode === 'banque' ? 'virement' : 'mobile_money';
}

/** Objectif du cahier des charges : intervenants payes sous 48 a 72 h apres validation de la mission. */
export const DELAI_PAIEMENT = { cible: 48, limite: 72 } as const;

export type NiveauDelai = 'ok' | 'attention' | 'retard';

/**
 * Delai ecoule depuis la validation de la mission : jusqu'au paiement s'il
 * a eu lieu, jusqu'a maintenant sinon. Sous 48 h c'est dans l'objectif,
 * entre 48 et 72 h il faut payer sans tarder, au-dela c'est en retard.
 */
export function delaiPaiement(duDepuis: Date | string, payeLe: Date | string | null, maintenant = new Date()): { heures: number; niveau: NiveauDelai } {
  const fin = payeLe ? new Date(payeLe) : maintenant;
  const heures = Math.max(0, Math.floor((fin.getTime() - new Date(duDepuis).getTime()) / 3_600_000));
  return { heures, niveau: heures <= DELAI_PAIEMENT.cible ? 'ok' : heures <= DELAI_PAIEMENT.limite ? 'attention' : 'retard' };
}

/** 5 -> « 5 h » ; 51 -> « 2 j 3 h ». */
export function libelleDuree(heures: number): string {
  if (heures < 24) return `${heures} h`;
  const j = Math.floor(heures / 24);
  const h = heures % 24;
  return h ? `${j} j ${h} h` : `${j} j`;
}

export interface LigneEquipePayable {
  intervenant_id: string;
  role: 'titulaire' | 'remplacant';
  reponse: 'en_attente' | 'accepte' | 'refuse';
  presence: 'present' | 'retard' | 'absent' | null;
  /** Remuneration annoncee dans la proposition, figee a l'envoi. */
  remuneration_proposee_fcfa: number | null;
}

/**
 * Paiements dus a la validation d'une mission : un par titulaire engage et
 * pointe present (un retard reste paye ; il pese sur le score). Le montant
 * est celui annonce dans la proposition, a defaut la remuneration de la
 * mission. `sansMontant` : intervenants pour lesquels aucun montant n'est connu.
 */
export function paiementsDus(lignes: LigneEquipePayable[], remunerationMission: number | null) {
  const dus: { intervenant_id: string; montant: number }[] = [];
  const sansMontant: string[] = [];
  for (const l of lignes) {
    if (l.role !== 'titulaire' || l.reponse !== 'accepte' || (l.presence !== 'present' && l.presence !== 'retard')) continue;
    const montant = l.remuneration_proposee_fcfa ?? remunerationMission;
    if (montant === null) sansMontant.push(l.intervenant_id);
    else dus.push({ intervenant_id: l.intervenant_id, montant });
  }
  return { dus, sansMontant };
}

interface FormLike {
  get(k: string): unknown;
}

const texte = (f: FormLike, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);

type Resultat<T> = { ok: true; donnees: T } | { ok: false; erreurs: Record<string, string> };

/** Saisie du versement a un intervenant : mode, reference de la transaction, date et heure. */
export function lirePaiement(f: FormLike, maintenant = new Date()): Resultat<{ mode: ModePaiement; reference: string; payeLe: Date }> {
  const erreurs: Record<string, string> = {};
  const mode = texte(f, 'mode') as ModePaiement;
  if (!(mode in MODES_PAIEMENT)) erreurs.mode = 'Choisissez le mode de paiement.';
  const reference = texte(f, 'reference', 100);
  if (reference.length < 3) {
    erreurs.reference = mode === 'especes' ? 'Indiquez le numéro du reçu signé.' : 'Indiquez la référence de la transaction (identifiant Mobile Money ou bancaire).';
  }
  const payeLe = lireDateHeure(texte(f, 'paye_le'));
  if (!payeLe) erreurs.paye_le = 'Indiquez la date et l’heure du paiement.';
  else if (payeLe.getTime() > maintenant.getTime() + 5 * 60_000) erreurs.paye_le = 'Le paiement ne peut pas être daté dans le futur.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { mode, reference, payeLe: payeLe! } };
}

/** Levee d'un litige : explication obligatoire, montant corrige facultatif. */
export function lireLeveeLitige(f: FormLike): Resultat<{ explication: string; montant: number | null }> {
  const erreurs: Record<string, string> = {};
  const explication = texte(f, 'explication', 1000);
  if (explication.length < 5) erreurs.explication = 'Expliquez comment le litige a été réglé.';
  const montant = lireMontant(texte(f, 'montant'));
  if (Number.isNaN(montant)) erreurs.montant = 'Montant invalide (en FCFA, sans décimales).';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { explication, montant } };
}

// ------------------------------------------------------------ factures et acomptes

export type TypeFacture = 'acompte' | 'facture';

export const TYPES_FACTURE: Record<TypeFacture, { libelle: string; prefixe: string }> = {
  acompte: { libelle: 'Acompte', prefixe: 'AC' },
  facture: { libelle: 'Facture', prefixe: 'FA' },
};

export type StatutFacture = 'brouillon' | 'emise' | 'partielle' | 'reglee' | 'annulee';

export const STATUTS_FACTURE: Record<StatutFacture, { libelle: string; ton: 'neutre' | 'info' | 'alerte' | 'ok' | 'eteint' }> = {
  brouillon: { libelle: 'Brouillon', ton: 'neutre' },
  emise: { libelle: 'Émise', ton: 'info' },
  partielle: { libelle: 'Réglée en partie', ton: 'alerte' },
  reglee: { libelle: 'Réglée', ton: 'ok' },
  annulee: { libelle: 'Annulée', ton: 'eteint' },
};

export type Tresorerie = 'missions' | 'administrative';

export const TRESORERIES: Record<Tresorerie, { libelle: string; aide: string }> = {
  missions: { libelle: 'Trésorerie missions', aide: 'Encaissements des missions et paiements des intervenants' },
  administrative: { libelle: 'Trésorerie administrative', aide: 'Recettes hors missions (frais de dossier, formation, prestations diverses)' },
};

export type ModeReglement = 'mobile_money' | 'virement' | 'cheque' | 'especes';

export const MODES_REGLEMENT: Record<ModeReglement, string> = {
  virement: 'Virement bancaire',
  mobile_money: 'Mobile Money',
  cheque: 'Chèque',
  especes: 'Espèces',
};

/** FA-2026-0001 : numerotation continue par type et par annee. */
export function numeroFacture(prefixe: string, annee: number, n: number): string {
  return `${prefixe}-${annee}-${String(n).padStart(4, '0')}`;
}

/** Statut d'une facture emise d'apres ce qui a ete regle. */
export function statutApresReglement(montant: number, regle: number): 'emise' | 'partielle' | 'reglee' {
  if (regle >= montant) return 'reglee';
  return regle > 0 ? 'partielle' : 'emise';
}

/**
 * Au-dela de ce nombre de jours apres l'echeance, le retard est « important »
 * et declenche une alerte (cahier des charges 5.6). Valeur de depart, a
 * confirmer par la direction.
 */
export const RETARD_IMPORTANT_JOURS = 15;

export type NiveauFacture = 'soldee' | 'annulee' | 'a_echoir' | 'echue' | 'retard_important';

export function situationFacture(
  f: { statut: StatutFacture; montant_fcfa: number; montant_regle_fcfa: number; echeance_le: string | null },
  aujourdhui: string,
): { reste: number; joursRetard: number; niveau: NiveauFacture } {
  if (f.statut === 'annulee') return { reste: 0, joursRetard: 0, niveau: 'annulee' };
  const reste = Math.max(0, f.montant_fcfa - f.montant_regle_fcfa);
  if (reste === 0) return { reste, joursRetard: 0, niveau: 'soldee' };
  const joursRetard = f.echeance_le ? Math.max(0, joursEntre(f.echeance_le, aujourdhui)) : 0;
  if (joursRetard === 0) return { reste, joursRetard, niveau: 'a_echoir' };
  return { reste, joursRetard, niveau: joursRetard > RETARD_IMPORTANT_JOURS ? 'retard_important' : 'echue' };
}

/**
 * Montants et echeances proposes a l'emission, d'apres le budget de la
 * mission et les conditions du client (acompte en %, delai de paiement).
 * La facture de solde deduit les acomptes deja factures.
 */
export function suggestionsFacture(d: {
  budget: number | null;
  acomptePourcent: number;
  delaiJours: number;
  acomptesFactures: number;
  facturesEmises: number;
  aujourdhui: string;
}): { type: TypeFacture; montant: Record<TypeFacture, number | null>; echeance: Record<TypeFacture, string> } {
  const acompte = d.budget && d.acomptePourcent && !d.acomptesFactures ? Math.round((d.budget * d.acomptePourcent) / 100) : null;
  const solde = d.budget ? Math.max(0, d.budget - d.acomptesFactures - d.facturesEmises) || null : null;
  return {
    // l'acompte d'abord, s'il est prevu et pas encore demande
    type: acompte ? 'acompte' : 'facture',
    montant: { acompte, facture: solde },
    // un acompte se regle a la commande
    echeance: { acompte: d.aujourdhui, facture: ajouterJours(d.aujourdhui, d.delaiJours) },
  };
}

export interface SaisieFacture {
  type: TypeFacture;
  objet: string;
  montant: number;
  emise_le: string;
  echeance_le: string;
  tresorerie: Tresorerie;
}

/** Lecture du formulaire d'emission. Une facture liee a une mission releve de la tresorerie « missions ». */
export function lireFacture(f: FormLike, c: { aujourdhui: string; missionLiee: boolean }): Resultat<SaisieFacture> {
  const erreurs: Record<string, string> = {};
  const type = texte(f, 'type') as TypeFacture;
  if (!(type in TYPES_FACTURE)) erreurs.type = 'Choisissez acompte ou facture.';
  const objet = texte(f, 'objet', 300);
  if (objet.length < 3) erreurs.objet = 'Décrivez la prestation facturée.';
  const montant = lireMontant(texte(f, 'montant'));
  if (montant === null || Number.isNaN(montant) || montant <= 0) erreurs.montant = 'Montant en FCFA, sans décimales, supérieur à 0.';
  const emise = texte(f, 'emise_le');
  if (!jourValide(emise)) erreurs.emise_le = 'Date d’émission invalide.';
  else if (emise > c.aujourdhui) erreurs.emise_le = 'Une facture ne peut pas être datée dans le futur.';
  const echeance = texte(f, 'echeance_le');
  if (!jourValide(echeance)) erreurs.echeance_le = 'Date d’échéance invalide.';
  else if (jourValide(emise) && echeance < emise) erreurs.echeance_le = 'L’échéance ne peut pas précéder l’émission.';
  const tresorerie = (c.missionLiee ? 'missions' : texte(f, 'tresorerie')) as Tresorerie;
  if (!(tresorerie in TRESORERIES)) erreurs.tresorerie = 'Choisissez la trésorerie.';
  return Object.keys(erreurs).length
    ? { ok: false, erreurs }
    : { ok: true, donnees: { type, objet, montant: montant!, emise_le: emise, echeance_le: echeance, tresorerie } };
}

/** Lecture d'un reglement recu : jamais plus que le reste a payer. */
export function lireReglement(f: FormLike, c: { reste: number; aujourdhui: string }): Resultat<{ montant: number; mode: ModeReglement; reference: string; regle_le: string }> {
  const erreurs: Record<string, string> = {};
  const montant = lireMontant(texte(f, 'montant'));
  if (montant === null || Number.isNaN(montant) || montant <= 0) erreurs.montant = 'Montant en FCFA, sans décimales, supérieur à 0.';
  else if (montant > c.reste) erreurs.montant = `Le règlement dépasse le reste à payer (${c.reste.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA).`;
  const mode = texte(f, 'mode') as ModeReglement;
  if (!(mode in MODES_REGLEMENT)) erreurs.mode = 'Choisissez le mode de règlement.';
  const reference = texte(f, 'reference', 100);
  if (reference.length < 3) erreurs.reference = mode === 'especes' ? 'Indiquez le numéro du reçu remis.' : 'Indiquez la référence (transaction, virement ou numéro de chèque).';
  const regle = texte(f, 'regle_le');
  if (!jourValide(regle)) erreurs.regle_le = 'Date invalide.';
  else if (regle > c.aujourdhui) erreurs.regle_le = 'Un règlement ne peut pas être daté dans le futur.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { montant: montant!, mode, reference, regle_le: regle } };
}
