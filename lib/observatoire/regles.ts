/**
 * Regles de l'observatoire terrain (phase 6 : services d'analyse et de
 * connaissance terrain). Module pur, teste par tests/observatoire.test.mjs.
 *
 * La carte est dessinee sans service externe (pas de fond de carte en
 * ligne) : un contour simplifie du Benin et des villes reperes suffisent a
 * situer les releves, et rien ne sort du programme.
 */

export interface Point {
  lon: number;
  lat: number;
}

/** Contour simplifie du Benin (longitude, latitude), sens horaire depuis Hillacondji. Schema, pas une limite officielle. */
export const CONTOUR_BENIN: [number, number][] = [
  [1.63, 6.22], [2.0, 6.3], [2.4, 6.35], [2.72, 6.37], [2.7, 6.6], [2.72, 7.0], [2.67, 7.5], [2.72, 7.9], [2.73, 8.5],
  [2.85, 8.8], [3.1, 9.05], [3.15, 9.4], [3.35, 9.8], [3.55, 10.1], [3.6, 10.4], [3.7, 10.8], [3.6, 11.2], [3.6, 11.65],
  [3.49, 11.8], [3.39, 11.88], [3.1, 12.1], [2.84, 12.4], [2.4, 11.9], [1.98, 11.42], [1.44, 11.47], [1.1, 11.1],
  [0.92, 11.0], [0.78, 10.7], [0.78, 10.3], [0.95, 10.0], [1.4, 9.3], [1.62, 8.7], [1.62, 8.0], [1.65, 7.5], [1.6, 6.9],
  [1.65, 6.5], [1.63, 6.22],
];

/** Villes reperes (longitude, latitude approximatives). */
export const VILLES_REPERES: { nom: string; lon: number; lat: number }[] = [
  { nom: 'Cotonou', lon: 2.43, lat: 6.37 },
  { nom: 'Porto-Novo', lon: 2.62, lat: 6.5 },
  { nom: 'Abomey-Calavi', lon: 2.35, lat: 6.45 },
  { nom: 'Ouidah', lon: 2.09, lat: 6.36 },
  { nom: 'Lokossa', lon: 1.72, lat: 6.64 },
  { nom: 'Pobè', lon: 2.66, lat: 6.98 },
  { nom: 'Abomey', lon: 1.99, lat: 7.18 },
  { nom: 'Dassa-Zoumè', lon: 2.18, lat: 7.75 },
  { nom: 'Savè', lon: 2.49, lat: 8.03 },
  { nom: 'Parakou', lon: 2.63, lat: 9.34 },
  { nom: 'Djougou', lon: 1.67, lat: 9.71 },
  { nom: 'Natitingou', lon: 1.38, lat: 10.3 },
  { nom: 'Kandi', lon: 2.94, lat: 11.13 },
  { nom: 'Malanville', lon: 3.39, lat: 11.87 },
];

export interface Cadre {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * Cadre englobant des points, avec une marge relative et une etendue
 * minimale (un seul point, ou des points tres proches, restent lisibles).
 */
export function cadre(points: Point[], marge = 0.1, etendueMin = 0.02): Cadre | null {
  if (!points.length) return null;
  let minLon = Math.min(...points.map((p) => p.lon));
  let maxLon = Math.max(...points.map((p) => p.lon));
  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  const elargir = (min: number, max: number) => {
    const e = Math.max(max - min, etendueMin);
    const centre = (min + max) / 2;
    const demi = (e * (1 + 2 * marge)) / 2;
    return [centre - demi, centre + demi];
  };
  [minLon, maxLon] = elargir(minLon, maxLon);
  [minLat, maxLat] = elargir(minLat, maxLat);
  return { minLon, maxLon, minLat, maxLat };
}

/** Facteur de la longitude a la latitude moyenne du cadre (1 degre de longitude raccourcit vers les poles). */
const facteur = (c: Cadre) => Math.cos((((c.minLat + c.maxLat) / 2) * Math.PI) / 180);

/** Elargit le cadre pour qu'il ait les proportions de la zone de dessin, sans deformer la carte. */
export function ajusterProportions(c: Cadre, largeur: number, hauteur: number): Cadre {
  const k = facteur(c);
  const l = (c.maxLon - c.minLon) * k;
  const h = c.maxLat - c.minLat;
  const voulu = largeur / hauteur;
  if (l / h > voulu) {
    const nouvelleH = l / voulu;
    const d = (nouvelleH - h) / 2;
    return { ...c, minLat: c.minLat - d, maxLat: c.maxLat + d };
  }
  const nouvelleL = (h * voulu) / k;
  const d = (nouvelleL - (c.maxLon - c.minLon)) / 2;
  return { ...c, minLon: c.minLon - d, maxLon: c.maxLon + d };
}

/** Coordonnees dans la zone de dessin (origine en haut a gauche). */
export function projeter(p: Point, c: Cadre, largeur: number, hauteur: number): { x: number; y: number } {
  return {
    x: ((p.lon - c.minLon) / (c.maxLon - c.minLon)) * largeur,
    y: ((c.maxLat - p.lat) / (c.maxLat - c.minLat)) * hauteur,
  };
}

/** Le point est-il dans le cadre ? */
export function dansCadre(p: Point, c: Cadre): boolean {
  return p.lon >= c.minLon && p.lon <= c.maxLon && p.lat >= c.minLat && p.lat <= c.maxLat;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * Nombre d'evenements par mois sur les `n` derniers mois jusqu'a `dernier`
 * (AAAA-MM). Les dates sont des AAAA-MM-JJ ou des instants (lus en UTC+1).
 */
export function serieMensuelle(dates: (string | Date)[], dernier: string, n = 12): { mois: string; libelle: string; total: number }[] {
  const [a, m] = dernier.split('-').map(Number);
  const cases = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    const cle = d.toISOString().slice(0, 7);
    return { mois: cle, libelle: `${MOIS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, total: 0 };
  });
  const index = new Map(cases.map((c, i) => [c.mois, i]));
  for (const d of dates) {
    const cle = typeof d === 'string' && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : new Date(new Date(d).getTime() + 3_600_000).toISOString().slice(0, 7);
    const i = index.get(cle);
    if (i !== undefined) cases[i].total++;
  }
  return cases;
}
