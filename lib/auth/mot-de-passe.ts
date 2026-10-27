import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hachage des mots de passe des comptes internes.
 *
 * scrypt du module `node:crypto` : derivation lente et couteuse en memoire,
 * recommandee par l'OWASP, sans dependance externe. Un sel par compte, et une
 * comparaison en temps constant.
 *
 * Module sans import Next ni alias : le script `semer.mjs` l'utilise
 * directement sous Node.
 */

const LONGUEUR = 64;
const OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hacher(motDePasse: string): { hash: string; sel: string } {
  const sel = randomBytes(16).toString('hex');
  const hash = scryptSync(motDePasse.normalize('NFKC'), sel, LONGUEUR, OPTIONS).toString('hex');
  return { hash, sel };
}

export function verifier(motDePasse: string, hash: string, sel: string): boolean {
  try {
    const calcule = scryptSync(motDePasse.normalize('NFKC'), sel, LONGUEUR, OPTIONS);
    const attendu = Buffer.from(hash, 'hex');
    return attendu.length === calcule.length && timingSafeEqual(calcule, attendu);
  } catch {
    return false;
  }
}

/** Problemes de robustesse ; liste vide si le mot de passe est acceptable. */
export function robustesse(motDePasse: string): string[] {
  const p: string[] = [];
  if (motDePasse.length < 10) p.push('Au moins 10 caractères.');
  if (!/[a-z]/.test(motDePasse) || !/[A-Z]/.test(motDePasse)) p.push('Des minuscules et des majuscules.');
  if (!/[0-9]/.test(motDePasse)) p.push('Au moins un chiffre.');
  if (/proxima|motdepasse|password|azerty|123456/i.test(motDePasse)) p.push('Pas de terme trop prévisible.');
  return p;
}
