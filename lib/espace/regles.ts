/**
 * Regles de l'espace intervenant : liens d'acces, verification, contenu
 * visible. Module pur, teste par tests/espace.test.mjs.
 */

/** Un lien d'acces se sert dans la semaine, une seule fois. */
export const DUREE_LIEN_JOURS = 7;
/** Une fois connecte, le telephone reste reconnu trois mois. */
export const DUREE_SESSION_JOURS = 90;
/** Dates de naissance erronees tolerees avant revocation du lien. */
export const ECHECS_MAX = 5;

export type EtatLien = 'valide' | 'expire' | 'utilise' | 'revoque';

export function etatLien(
  l: { expire_le: Date | string; utilise_le: Date | string | null; revoque_le: Date | string | null; echecs: number },
  maintenant = new Date(),
): EtatLien {
  if (l.revoque_le || l.echecs >= ECHECS_MAX) return 'revoque';
  if (l.utilise_le) return 'utilise';
  if (new Date(l.expire_le).getTime() <= maintenant.getTime()) return 'expire';
  return 'valide';
}

export const MESSAGES_LIEN: Record<Exclude<EtatLien, 'valide'>, string> = {
  expire: 'Ce lien a expiré.',
  utilise: 'Ce lien a déjà servi.',
  revoque: 'Ce lien n’est plus valable.',
};

/** Statuts de profil qui donnent acces a l'espace : tous sauf « inactif ». */
export function accesAutorise(statut: string): boolean {
  return statut !== 'inactif';
}

/**
 * Date de naissance saisie : champ date (AAAA-MM-JJ) ou saisie libre
 * JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA. Retourne AAAA-MM-JJ, ou null.
 */
export function lireDateNaissance(saisie: string): string | null {
  const s = (saisie ?? '').trim();
  let a: number, m: number, j: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (r) [a, m, j] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s))) [j, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  return d.toISOString().slice(0, 10);
}

/** Message qui accompagne le lien. */
export function messageAcces(prenoms: string, lien: string): string {
  return [
    `Bonjour ${prenoms.trim().split(/\s+/)[0]},`,
    'Voici votre lien personnel vers votre espace PROXIMA CONNECT : vos missions, vos paiements et votre score.',
    lien,
    `Il sert une seule fois et reste valable ${DUREE_LIEN_JOURS} jours. Votre date de naissance vous sera demandée. Ne le transmettez à personne.`,
  ].join('\n');
}

const LIEN = /(\/espace\/acces\/)[A-Za-z0-9_-]{20,}/g;

/**
 * Le jeton du lien ne doit jamais etre stocke en clair, pas meme dans
 * l'historique des messages : on l'y remplace par une mention.
 */
export function masquerLien(texte: string): string {
  return texte.replace(LIEN, '$1[lien personnel]');
}
