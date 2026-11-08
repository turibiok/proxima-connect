/**
 * Regles des communications avec les intervenants (cahier des charges 5.8) :
 * modeles de messages, liens d'envoi, cout d'un SMS, saisie.
 *
 * Module pur, teste par tests/communication.test.mjs.
 *
 * Envoi « assiste » en phase 2 : le programme redige le message et ouvre
 * WhatsApp ou l'application SMS du telephone de l'equipe, qui l'envoie ;
 * chaque envoi est trace. Le branchement d'un fournisseur (envoi
 * automatique, phase 3) attend le choix de PROXIMA (note de cadrage, 7.3).
 */

import { date } from '../format.ts';
import { formaterFCFA } from '../clients/regles.ts';

// ------------------------------------------------------------ referentiels

export type Canal = 'sms' | 'whatsapp' | 'appel' | 'email';
export type CanalEnvoi = 'sms' | 'whatsapp';

export const CANAUX: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  appel: 'Appel',
  email: 'E-mail',
};

export type Modele = 'proposition' | 'rappel' | 'paiement' | 'libre' | 'echange';

export const MODELES: Record<Modele, string> = {
  proposition: 'Proposition de mission',
  rappel: 'Rappel de mission',
  paiement: 'Confirmation de paiement',
  libre: 'Message',
  echange: 'Échange consigné',
};

/** Modeles qu'on envoie depuis l'ecran d'envoi (la proposition a son propre circuit, module 5.3). */
export const MODELES_ENVOI = ['rappel', 'paiement', 'libre'] as const;
export type ModeleEnvoi = (typeof MODELES_ENVOI)[number];

// ------------------------------------------------------------ modeles de messages

const prenomUsuel = (prenoms: string) => prenoms.trim().split(/\s+/)[0];
const montant = (n: number) => formaterFCFA(n).replace(/[  ]/g, ' ');

/** « aujourd'hui », « demain », ou « le 14 nov. 2026 ». */
export function quand(jour: string, aujourdhui: string): string {
  if (jour === aujourdhui) return 'aujourd’hui';
  const demain = new Date(`${aujourdhui}T12:00:00Z`);
  demain.setUTCDate(demain.getUTCDate() + 1);
  if (jour === demain.toISOString().slice(0, 10)) return `demain (${date(jour)})`;
  return `le ${date(jour)}`;
}

export interface Rappel {
  prenoms: string;
  titre: string;
  date_debut: string | null;
  horaires: string | null;
  lieu: string | null;
  zone: string | null;
  aujourdhui: string;
}

/** Rappel envoye la veille du demarrage : quand, ou, a quelle heure. */
export function messageRappel(r: Rappel): string {
  return [
    `Bonjour ${prenomUsuel(r.prenoms)},`,
    `Rappel PROXIMA CONNECT : la mission « ${r.titre} » commence ${r.date_debut ? quand(r.date_debut, r.aujourdhui) : 'bientôt'}.`,
    `- Rendez-vous : ${r.lieu ?? r.zone ?? 'à confirmer'}`,
    r.horaires && `- Horaires : ${r.horaires}`,
    'Merci d’être à l’heure. En cas d’empêchement, prévenez-nous au plus vite pour que nous organisions un remplacement.',
  ].filter(Boolean).join('\n');
}

export interface ConfirmationPaiement {
  prenoms: string;
  montant: number;
  titre: string;
  reference: string;
  mode: 'mobile_money' | 'virement' | 'especes';
  referenceTransaction: string;
  compte: string | null;
}

/** Fin du numero ou du compte credite, sans le devoiler en entier dans un message. */
export function finDeCompte(compte: string | null): string | null {
  const chiffres = (compte ?? '').replace(/\D/g, '');
  return chiffres.length >= 4 ? chiffres.slice(-4) : null;
}

/** Confirmation envoyee apres le paiement : montant, mission, moyen, reference a citer en cas de reclamation. */
export function messageConfirmationPaiement(p: ConfirmationPaiement): string {
  const fin = finDeCompte(p.compte);
  const moyen =
    p.mode === 'especes'
      ? 'en espèces, contre reçu'
      : `par ${p.mode === 'virement' ? 'virement' : 'Mobile Money'}${fin ? ` sur le compte se terminant par ${fin}` : ''}`;
  return [
    `Bonjour ${prenomUsuel(p.prenoms)},`,
    `PROXIMA CONNECT vous a versé ${montant(p.montant)} pour la mission « ${p.titre} » (${p.reference}), ${moyen}.`,
    `Référence : ${p.referenceTransaction}. Gardez-la en cas de réclamation.`,
    'Merci pour votre travail.',
  ].join('\n');
}

// ------------------------------------------------------------ SMS

// Alphabet GSM 03.38 : un SMS de 160 caracteres. Un seul caractere hors de
// cet alphabet (« ê », « ç », « ’ », « « ») fait passer tout le message en
// Unicode : 70 caracteres par SMS, donc deux a trois fois plus de SMS factures.
const GSM = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_ETENDU = new Set('^{}\\[~]|€\f');

/** Nombre de SMS factures pour un texte, selon l'encodage qu'il impose. */
export function segmentsSms(texte: string): { encodage: 'GSM' | 'Unicode'; caracteres: number; segments: number } {
  const car = [...texte];
  if (car.every((c) => GSM.has(c) || GSM_ETENDU.has(c))) {
    const n = car.reduce((t, c) => t + (GSM_ETENDU.has(c) ? 2 : 1), 0);
    return { encodage: 'GSM', caracteres: n, segments: n === 0 ? 0 : n <= 160 ? 1 : Math.ceil(n / 153) };
  }
  // un caractere hors du plan de base compte double en UTF-16
  const n = car.reduce((t, c) => t + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return { encodage: 'Unicode', caracteres: n, segments: n <= 70 ? 1 : Math.ceil(n / 67) };
}

const REMPLACEMENTS: [RegExp, string][] = [
  [/[âä]/g, 'a'], [/[êë]/g, 'e'], [/[îï]/g, 'i'], [/[ôö]/g, 'o'], [/û/g, 'u'], [/ç/g, 'c'],
  [/[ÂÀ]/g, 'A'], [/[ÊÈË]/g, 'E'], [/[ÎÏ]/g, 'I'], [/[ÔÖ]/g, 'O'], [/[ÛÙ]/g, 'U'],
  [/œ/g, 'oe'], [/Œ/g, 'OE'], [/[«»“”]/g, '"'], [/[‘’]/g, "'"], [/[–—]/g, '-'], [/…/g, '...'], [/[  ]/g, ' '],
];

/**
 * Version SMS d'un texte : les caracteres hors alphabet GSM qui ont un
 * equivalent proche sont remplaces (ê -> e, « -> "), pour rester a
 * 160 caracteres par SMS. Les lettres accentuees de l'alphabet GSM
 * (é, è, à, ù) sont gardees.
 */
export function versSms(texte: string): string {
  return REMPLACEMENTS.reduce((t, [motif, par]) => t.replace(motif, par), texte);
}

/** Lien qui ouvre la conversation, message pre-rempli, sur le telephone de l'equipe. */
export function lienEnvoi(canal: CanalEnvoi, e164: string, texte: string): string {
  const numero = e164.replace(/^\+/, '');
  // « ?&body= » est compris a la fois par Android et par iOS
  return canal === 'whatsapp' ? `https://wa.me/${numero}?text=${encodeURIComponent(texte)}` : `sms:+${numero}?&body=${encodeURIComponent(texte)}`;
}

// ------------------------------------------------------------ saisie

interface FormLike {
  get(k: string): unknown;
}

type Resultat<T> = { ok: true; donnees: T } | { ok: false; erreurs: Record<string, string> };

const texte = (f: FormLike, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);

/** Message envoye depuis l'ecran d'envoi. */
export function lireMessage(f: FormLike): Resultat<{ canal: CanalEnvoi; modele: ModeleEnvoi; contenu: string }> {
  const erreurs: Record<string, string> = {};
  const canal = texte(f, 'canal') as CanalEnvoi;
  if (canal !== 'sms' && canal !== 'whatsapp') erreurs.canal = 'Choisissez SMS ou WhatsApp.';
  const modele = texte(f, 'modele') as ModeleEnvoi;
  if (!MODELES_ENVOI.includes(modele)) erreurs.modele = 'Type de message inconnu.';
  const contenu = texte(f, 'contenu', 1000);
  if (contenu.length < 3) erreurs.contenu = 'Le message est vide.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { canal, modele, contenu } };
}

/** Echange consigne a la main : appel, message recu, e-mail… */
export function lireEchange(f: FormLike): Resultat<{ canal: Canal; sens: 'entrant' | 'sortant'; contenu: string }> {
  const erreurs: Record<string, string> = {};
  const canal = texte(f, 'canal') as Canal;
  if (!(canal in CANAUX)) erreurs.canal = 'Choisissez le canal.';
  const sens = texte(f, 'sens');
  if (sens !== 'entrant' && sens !== 'sortant') erreurs.sens = 'Indiquez qui a contacté qui.';
  const contenu = texte(f, 'contenu', 1000);
  if (contenu.length < 3) erreurs.contenu = 'Résumez l’échange en quelques mots.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: { canal, sens: sens as 'entrant' | 'sortant', contenu } };
}
