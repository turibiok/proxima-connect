/**
 * Regles du reporting (cahier des charges 5.7) : rapport de mission pour le
 * client, satisfaction client, rentabilite, exports CSV.
 *
 * Module pur, teste par tests/reporting.test.mjs.
 */

import { lireDateHeure } from '../finances/regles.ts';

interface FormLike {
  get(k: string): unknown;
  getAll(k: string): unknown[];
}

type Resultat<T> = { ok: true; donnees: T } | { ok: false; erreurs: Record<string, string> };

const texte = (f: FormLike, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);

// ------------------------------------------------------------ rapport

export type CanalRapport = 'email' | 'whatsapp' | 'remise' | 'autre';

export const CANAUX_RAPPORT: Record<CanalRapport, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  remise: 'Remis en main propre',
  autre: 'Autre',
};

export interface Indicateur {
  libelle: string;
  cible: string | null;
  resultat: string | null;
}

export const INDICATEURS_MAX = 15;

/**
 * Indicateurs convenus avec le client, saisis en lignes (libelle, cible,
 * resultat). Les lignes sans libelle sont ignorees : c'est ainsi qu'on en
 * supprime une.
 */
export function lireIndicateurs(f: FormLike): Resultat<{ indicateurs: Indicateur[]; synthese: string | null }> {
  const libelles = f.getAll('libelle').map((x) => String(x).trim().slice(0, 200));
  const cibles = f.getAll('cible').map((x) => String(x).trim().slice(0, 200));
  const resultats = f.getAll('resultat').map((x) => String(x).trim().slice(0, 500));
  const indicateurs: Indicateur[] = [];
  const erreurs: Record<string, string> = {};
  libelles.forEach((libelle, i) => {
    if (!libelle) {
      if (cibles[i] || resultats[i]) erreurs[`ligne_${i}`] = 'Nommez l’indicateur, ou videz la ligne.';
      return;
    }
    indicateurs.push({ libelle, cible: cibles[i] || null, resultat: resultats[i] || null });
  });
  if (indicateurs.length > INDICATEURS_MAX) erreurs.general = `${INDICATEURS_MAX} indicateurs au plus.`;
  const synthese = texte(f, 'synthese', 4000) || null;
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { indicateurs, synthese } };
}

/** Transmission du rapport au client : canal, destinataire, date et heure (heure du Benin). */
export function lireTransmission(f: FormLike, maintenant = new Date()): Resultat<{ canal: CanalRapport; destinataire: string; le: Date }> {
  const erreurs: Record<string, string> = {};
  const canal = texte(f, 'canal') as CanalRapport;
  if (!(canal in CANAUX_RAPPORT)) erreurs.canal = 'Choisissez comment le rapport a été transmis.';
  const destinataire = texte(f, 'destinataire', 200);
  if (destinataire.length < 3) erreurs.destinataire = 'Indiquez à qui le rapport a été transmis (nom, adresse ou numéro).';
  const le = lireDateHeure(texte(f, 'transmis_le'));
  if (!le) erreurs.transmis_le = 'Indiquez la date et l’heure de la transmission.';
  else if (le.getTime() > maintenant.getTime() + 5 * 60_000) erreurs.transmis_le = 'La transmission ne peut pas être datée dans le futur.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { canal, destinataire, le: le! } };
}

// ------------------------------------------------------------ satisfaction client

export const NOTES_SATISFACTION: Record<number, string> = {
  1: 'Très insatisfait',
  2: 'Insatisfait',
  3: 'Moyennement satisfait',
  4: 'Satisfait',
  5: 'Très satisfait',
};

/** Un client est compte satisfait a partir de 4 sur 5. */
export const SEUIL_SATISFAIT = 4;
/** Cible a 12 mois (cahier des charges, section 11). */
export const CIBLE_SATISFACTION = 0.85;

/** Part des missions notees dont le client est satisfait ; null sans aucune note. */
export function tauxSatisfaction(notes: number[]): number | null {
  if (!notes.length) return null;
  return notes.filter((n) => n >= SEUIL_SATISFAIT).length / notes.length;
}

/** Retour du client : note de 1 a 5 ; une note basse s'accompagne de ce que le client reproche. */
export function lireSatisfaction(f: FormLike): Resultat<{ note: number; commentaire: string | null }> {
  const erreurs: Record<string, string> = {};
  const note = Number(texte(f, 'note'));
  if (!Number.isInteger(note) || note < 1 || note > 5) erreurs.note = 'Choisissez une note de 1 à 5.';
  const commentaire = texte(f, 'commentaire', 1000) || null;
  if (Number.isInteger(note) && note <= 2 && !commentaire) erreurs.commentaire = 'Notez ce que le client reproche : c’est ce qui permettra de corriger.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { note, commentaire } };
}

// ------------------------------------------------------------ rentabilite

/**
 * Marge d'une mission ou d'un client : facture (factures et acomptes non
 * annules) moins le cout des intervenants (paiements dus ou verses).
 */
export function rentabilite(facture: number, cout: number): { marge: number; taux: number | null } {
  return { marge: facture - cout, taux: facture > 0 ? (facture - cout) / facture : null };
}

// ------------------------------------------------------------ export CSV

export interface Colonne<T> {
  libelle: string;
  valeur: (ligne: T) => string | number | null | undefined;
}

/**
 * Cellule CSV. Un texte commencant par = + - @ serait interprete comme une
 * formule par le tableur (injection de formule) : on le prefixe d'une
 * apostrophe. Les nombres restent des nombres.
 */
export function celluleCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Fichier CSV lisible tel quel par Excel en francais : separateur « ; »,
 * virgule decimale, fins de ligne CRLF et marque UTF-8 en tete (sans elle,
 * Excel lit les accents de travers).
 */
export function versCsv<T>(colonnes: Colonne<T>[], lignes: T[]): string {
  const tete = colonnes.map((c) => celluleCsv(c.libelle)).join(';');
  const corps = lignes.map((l) => colonnes.map((c) => celluleCsv(c.valeur(l))).join(';'));
  return `﻿${[tete, ...corps].join('\r\n')}\r\n`;
}
