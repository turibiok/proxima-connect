/**
 * Regles metier des profils d'intervenants (cahier des charges 5.1).
 *
 * Module pur (ni base, ni Next), pour que chaque regle soit testable seule
 * et appliquee a l'identique par le formulaire public et par le back-office.
 */

import {
  CATEGORIES_MISSIONS,
  CRENEAUX,
  DEPLACEMENTS,
  JOURS,
  NIVEAUX_ETUDES,
  PIECES,
  SITUATIONS,
  type StatutProfil,
} from '../referentiel.ts';

/** Version du texte de consentement affiche sur le formulaire. A incrementer a chaque changement du texte. */
export const VERSION_CONSENTEMENT = '2026-10-v1';

export const AGE_MINIMUM = 18;

// ------------------------------------------------------------ telephone

/**
 * Normalise un numero beninois au format international a 10 chiffres.
 *
 * Depuis la migration de la numerotation (novembre 2024), un numero mobile
 * beninois compte 10 chiffres et commence par 01 ; un ancien numero a
 * 8 chiffres s'obtient en le prefixant de 01. On accepte donc les deux
 * saisies, avec ou sans indicatif, et on stocke une forme unique ; sans quoi
 * la meme personne pourrait s'inscrire deux fois sous deux ecritures.
 *
 * Retourne null si la saisie n'est pas un numero beninois valide.
 */
export function normaliserTelephone(saisie: string): string | null {
  let n = (saisie ?? '').replace(/[\s.\-()/]/g, '');
  if (n.startsWith('+229')) n = n.slice(4);
  else if (n.startsWith('00229')) n = n.slice(5);
  if (!/^\d+$/.test(n)) return null;
  if (n.length === 8) n = `01${n}`;
  if (n.length !== 10 || !n.startsWith('01')) return null;
  return `+229${n}`;
}

/** +2290197123456 -> +229 01 97 12 34 56 */
export function afficherTelephone(e164: string | null | undefined): string {
  if (!e164) return '-';
  const m = /^\+229(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+229 ${m.slice(1).join(' ')}` : e164;
}

/** Lien wa.me (sans le +) pour ouvrir une conversation WhatsApp. */
export function lienWhatsApp(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, '')}`;
}

// ------------------------------------------------------------ age

/** Age revolu en annees a la date `ref`. `naissance` au format AAAA-MM-JJ. */
export function ageRevolu(naissance: string, ref: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance ?? '');
  if (!m) return null;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  // rejette 2001-02-30 et consorts, que Date corrige silencieusement
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
  let age = ref.getUTCFullYear() - a;
  const anniversairePasse =
    ref.getUTCMonth() + 1 > mo || (ref.getUTCMonth() + 1 === mo && ref.getUTCDate() >= j);
  if (!anniversairePasse) age--;
  return age;
}

// ------------------------------------------------------------ verifications

export interface EtatVerification {
  date_naissance: string;
  identite_verifiee_le: Date | string | null;
  telephone_verifie_le: Date | string | null;
  paiement_verifie_le: Date | string | null;
  paiement_mode: string | null;
  paiement_compte: string | null;
}

export interface Controle {
  code: 'identite' | 'age' | 'telephone' | 'paiement';
  libelle: string;
  ok: boolean;
  detail: string;
}

/** Les quatre controles exiges avant de declarer un profil verifie. */
export function controles(p: EtatVerification, ref: Date): Controle[] {
  const age = ageRevolu(p.date_naissance, ref);
  return [
    {
      code: 'identite',
      libelle: "Pièce d'identité contrôlée",
      ok: !!p.identite_verifiee_le,
      detail: p.identite_verifiee_le ? 'Contrôlée' : 'À contrôler sur présentation de la pièce',
    },
    {
      code: 'age',
      libelle: `Âge minimum ${AGE_MINIMUM} ans`,
      ok: age !== null && age >= AGE_MINIMUM,
      detail: age === null ? 'Date de naissance invalide' : `${age} ans`,
    },
    {
      code: 'telephone',
      libelle: 'Téléphone joignable',
      ok: !!p.telephone_verifie_le,
      detail: p.telephone_verifie_le ? 'Joint avec succès' : 'À appeler',
    },
    {
      code: 'paiement',
      libelle: 'Moyen de paiement traçable',
      ok: !!p.paiement_verifie_le && !!p.paiement_mode && !!p.paiement_compte,
      detail: !p.paiement_mode || !p.paiement_compte
        ? 'Aucun moyen de paiement renseigné'
        : p.paiement_verifie_le
          ? 'Vérifié'
          : 'À vérifier (titulaire du compte)',
    },
  ];
}

export function verificationComplete(p: EtatVerification, ref: Date): boolean {
  return controles(p, ref).every((c) => c.ok);
}

// ------------------------------------------------------------ cycle de statut

/**
 * Transitions autorisees. Verifie et actif exigent les quatre controles ;
 * suspendre ou desactiver exige un motif (il sera montre a l'intervenant en
 * cas de contestation).
 */
const TRANSITIONS: Record<StatutProfil, StatutProfil[]> = {
  en_attente: ['verifie', 'suspendu', 'inactif'],
  verifie: ['actif', 'suspendu', 'inactif'],
  actif: ['suspendu', 'inactif'],
  suspendu: ['actif', 'en_attente', 'inactif'],
  inactif: ['en_attente', 'actif'],
};

export function transitionsPossibles(de: StatutProfil): StatutProfil[] {
  return TRANSITIONS[de] ?? [];
}

/** Message d'erreur si la transition est refusee, null si elle est permise. */
export function refusTransition(
  de: StatutProfil,
  vers: StatutProfil,
  p: EtatVerification,
  motif: string,
  ref: Date,
): string | null {
  if (!transitionsPossibles(de).includes(vers)) return 'Ce changement de statut n’est pas permis.';
  if ((vers === 'verifie' || vers === 'actif') && !verificationComplete(p, ref)) {
    return 'Les quatre contrôles doivent être validés avant de déclarer le profil vérifié ou actif.';
  }
  if ((vers === 'suspendu' || vers === 'inactif') && !motif.trim()) {
    return 'Indiquez le motif de la suspension ou de la désactivation.';
  }
  return null;
}

// ------------------------------------------------------------ formulaire d'inscription

export interface Inscription {
  nom: string;
  prenoms: string;
  sexe: string | null;
  date_naissance: string;
  telephone: string;
  whatsapp: string | null;
  email: string | null;
  ville: string;
  quartier: string | null;
  zones: string[];
  deplacements: string[];
  niveau_etudes: string | null;
  formation: string | null;
  situation: string | null;
  experiences: string | null;
  competences: string[];
  langues: string[];
  jours_disponibles: string[];
  creneaux: string[];
  categories_missions: string[];
  piece_type: string | null;
  piece_numero: string | null;
  paiement_mode: string | null;
  paiement_operateur: string | null;
  paiement_compte: string | null;
}

interface FormLike {
  get(k: string): unknown;
  getAll(k: string): unknown[];
}

const texte = (f: FormLike, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
const optionnel = (f: FormLike, k: string, max = 200) => texte(f, k, max) || null;
const parmi = (f: FormLike, k: string, codes: string[]) => {
  const v = texte(f, k);
  return codes.includes(v) ? v : null;
};
const plusieurs = (f: FormLike, k: string, codes?: string[]) =>
  [...new Set(f.getAll(k).map((v) => String(v).trim()).filter(Boolean))]
    .filter((v) => !codes || codes.includes(v))
    .slice(0, 30);

/** Liste saisie librement (« Akpakpa, Fidjrossè ») ou par cases a cocher. */
const listeLibre = (f: FormLike, k: string) =>
  [...new Set(f.getAll(k).flatMap((v) => String(v).split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean))].slice(0, 30);

const codes = (l: { code: string }[]) => l.map((o) => o.code);

/**
 * Lit et valide une inscription. Retourne soit les donnees nettoyees, soit
 * les erreurs par champ, jamais les deux.
 */
export function lireInscription(
  f: FormLike,
  ref: Date,
): { ok: true; donnees: Inscription } | { ok: false; erreurs: Record<string, string> } {
  const erreurs: Record<string, string> = {};

  const telephone = normaliserTelephone(texte(f, 'telephone'));
  const whatsappSaisi = texte(f, 'whatsapp');
  const whatsapp = whatsappSaisi ? normaliserTelephone(whatsappSaisi) : null;
  const date_naissance = texte(f, 'date_naissance');
  const age = ageRevolu(date_naissance, ref);
  const email = optionnel(f, 'email');

  const d: Inscription = {
    nom: texte(f, 'nom', 80).toUpperCase(),
    prenoms: texte(f, 'prenoms', 120),
    sexe: parmi(f, 'sexe', ['F', 'M']),
    date_naissance,
    telephone: telephone ?? '',
    whatsapp,
    email: email?.toLowerCase() ?? null,
    ville: texte(f, 'ville', 80),
    quartier: optionnel(f, 'quartier', 80),
    zones: listeLibre(f, 'zones'),
    deplacements: plusieurs(f, 'deplacements', codes(DEPLACEMENTS)),
    niveau_etudes: parmi(f, 'niveau_etudes', codes(NIVEAUX_ETUDES)),
    formation: optionnel(f, 'formation'),
    situation: parmi(f, 'situation', codes(SITUATIONS)),
    experiences: optionnel(f, 'experiences', 2000),
    competences: listeLibre(f, 'competences'),
    langues: plusieurs(f, 'langues'),
    jours_disponibles: plusieurs(f, 'jours', codes(JOURS)),
    creneaux: plusieurs(f, 'creneaux', codes(CRENEAUX)),
    categories_missions: plusieurs(f, 'categories', codes(CATEGORIES_MISSIONS)),
    piece_type: parmi(f, 'piece_type', codes(PIECES)),
    piece_numero: optionnel(f, 'piece_numero', 40),
    paiement_mode: parmi(f, 'paiement_mode', ['mobile_money', 'banque']),
    paiement_operateur: optionnel(f, 'paiement_operateur', 60),
    paiement_compte: optionnel(f, 'paiement_compte', 60),
  };

  if (!d.nom) erreurs.nom = 'Le nom est obligatoire.';
  if (!d.prenoms) erreurs.prenoms = 'Le ou les prénoms sont obligatoires.';
  if (!telephone) erreurs.telephone = 'Numéro béninois invalide (10 chiffres commençant par 01).';
  if (whatsappSaisi && !whatsapp) erreurs.whatsapp = 'Numéro WhatsApp invalide.';
  if (age === null) erreurs.date_naissance = 'Date de naissance invalide.';
  else if (age < AGE_MINIMUM) erreurs.date_naissance = `Il faut avoir au moins ${AGE_MINIMUM} ans pour s'inscrire.`;
  else if (age > 75) erreurs.date_naissance = 'Vérifiez la date de naissance.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurs.email = 'Adresse e-mail invalide.';
  if (!d.ville) erreurs.ville = 'La ville est obligatoire.';
  if (d.categories_missions.length === 0) erreurs.categories = 'Choisissez au moins un type de mission.';
  if (d.jours_disponibles.length === 0) erreurs.jours = 'Indiquez au moins un jour de disponibilité.';
  if (d.paiement_mode === 'mobile_money') {
    if (!d.paiement_operateur) erreurs.paiement_operateur = 'Précisez l’opérateur Mobile Money.';
    const compte = d.paiement_compte ? normaliserTelephone(d.paiement_compte) : null;
    if (!compte) erreurs.paiement_compte = 'Numéro Mobile Money invalide.';
    else d.paiement_compte = compte;
  } else if (d.paiement_mode === 'banque' && !d.paiement_compte) {
    erreurs.paiement_compte = 'Indiquez la banque et le numéro de compte (RIB).';
  }
  if (f.get('consentement') !== 'oui') {
    erreurs.consentement = 'Votre consentement est nécessaire pour enregistrer votre profil.';
  }

  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: d };
}
