/**
 * Regles de l'automatisation (phase 3) : choix des profils, cycle des
 * propositions, lecture des reponses par SMS, configuration du fournisseur.
 *
 * Module pur, teste par tests/automatisation.test.mjs.
 */

import { date } from '../format.ts';

// ------------------------------------------------------------ selection

/** Remplacants a mobiliser en plus des titulaires (arrondi au superieur). */
export function nombreReserve(requis: number, pourcent: number): number {
  return Math.ceil((requis * pourcent) / 100);
}

export interface Classe {
  id: string;
  eligible: boolean;
  points: number;
  score: number | null;
}

/**
 * Profils retenus par la selection automatique : les eligibles les mieux
 * classes (adequation, puis score), hors ceux deja sollicites pour la
 * mission. Les premiers deviennent titulaires, les suivants remplacants.
 */
export function choisirCandidats(classes: Classe[], besoin: { titulaires: number; remplacants: number; exclus: Set<string> }) {
  const tries = classes
    .filter((c) => c.eligible && !besoin.exclus.has(c.id))
    .sort((a, b) => b.points - a.points || (b.score ?? 50) - (a.score ?? 50));
  const t = Math.max(0, besoin.titulaires);
  const r = Math.max(0, besoin.remplacants);
  return { titulaires: tries.slice(0, t).map((c) => c.id), remplacants: tries.slice(t, t + r).map((c) => c.id) };
}

// ------------------------------------------------------------ cycle des propositions

export type EtapeProposition = 'en_cours' | 'a_relancer' | 'expiree';

/**
 * Ou en est une proposition sans reponse : a mi-delai on relance une fois,
 * au terme du delai elle expire (comptee comme un refus « sans reponse »).
 */
export function etapeProposition(
  p: { proposee_le: Date | string; proposition_expire_le: Date | string; relance_le: Date | string | null },
  maintenant = new Date(),
): EtapeProposition {
  const debut = new Date(p.proposee_le).getTime();
  const fin = new Date(p.proposition_expire_le).getTime();
  const t = maintenant.getTime();
  if (t >= fin) return 'expiree';
  if (!p.relance_le && t >= debut + (fin - debut) / 2) return 'a_relancer';
  return 'en_cours';
}

export function messageRelance(prenoms: string, titre: string, expireLe: Date): string {
  const heure = expireLe.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' });
  return [
    `Bonjour ${prenoms.trim().split(/\s+/)[0]},`,
    `Rappel : la mission « ${titre} » vous attend.`,
    `Répondez OUI ou NON avant le ${date(expireLe)} à ${heure}. Sans réponse, elle sera proposée à quelqu’un d’autre.`,
  ].join('\n');
}

// ------------------------------------------------------------ reponses par SMS

const OUI = new Set(['oui', 'o', 'yes', 'y', 'ok', 'okay', 'daccord', 'd’accord', "d'accord", 'accepte', 'j’accepte', "j'accepte", '1']);
const NON = new Set(['non', 'n', 'no', 'refuse', 'pas', 'indisponible', '2']);

/** Premier mot d'un SMS recu : OUI (et variantes) accepte, NON refuse, sinon on ne sait pas. */
export function lireReponseSms(texte: string): 'accepte' | 'refuse' | null {
  const mot = (texte ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s,.!;:]+/)[0];
  if (!mot) return null;
  if (OUI.has(mot)) return 'accepte';
  if (NON.has(mot)) return 'refuse';
  return null;
}

// ------------------------------------------------------------ fournisseur

export type ConfigFournisseur =
  | { mode: 'aucun' }
  | { mode: 'simulation' }
  | { mode: 'twilio'; sid: string; token: string; smsFrom: string; whatsappFrom: string | null }
  | { mode: 'erreur'; message: string };

/**
 * Fournisseur d'envoi d'apres les variables d'environnement.
 *
 * - « aucun » (par defaut) : pas d'envoi automatique. Rien n'est marque
 *   comme envoye ; l'equipe envoie elle-meme, comme en phase 2.
 * - « simulation » (essais seulement) : les envois sont traces, marques
 *   SIMULATION, mais rien ne part.
 * - « twilio » : envoi reel par SMS, et par WhatsApp si un numero est configure.
 */
export function configFournisseur(env: Record<string, string | undefined>): ConfigFournisseur {
  const nom = (env.COMMUNICATION_FOURNISSEUR ?? '').trim().toLowerCase();
  if (nom === '' || nom === 'aucun') return { mode: 'aucun' };
  if (nom === 'simulation') return { mode: 'simulation' };
  if (nom !== 'twilio') return { mode: 'erreur', message: `Fournisseur inconnu : « ${nom} » (valeurs possibles : aucun, simulation, twilio).` };
  const manquent = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM'].filter((k) => !env[k]?.trim());
  if (manquent.length) return { mode: 'erreur', message: `Variables manquantes pour Twilio : ${manquent.join(', ')}.` };
  return {
    mode: 'twilio',
    sid: env.TWILIO_ACCOUNT_SID!.trim(),
    token: env.TWILIO_AUTH_TOKEN!.trim(),
    smsFrom: env.TWILIO_SMS_FROM!.trim(),
    whatsappFrom: env.TWILIO_WHATSAPP_FROM?.trim() || null,
  };
}

/** Le programme peut-il envoyer lui-meme ? */
export function envoiAutomatiquePossible(c: ConfigFournisseur): boolean {
  return c.mode === 'twilio' || c.mode === 'simulation';
}

/** Canal utilise pour un envoi automatique : WhatsApp si le fournisseur le permet, sinon SMS. */
export function canalAutomatique(c: ConfigFournisseur): 'whatsapp' | 'sms' {
  return c.mode === 'twilio' && c.whatsappFrom ? 'whatsapp' : 'sms';
}
