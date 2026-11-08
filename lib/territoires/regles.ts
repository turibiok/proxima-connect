/**
 * Regles des territoires (phase 5 : extension geographique). Module pur,
 * teste par tests/territoires.test.mjs.
 */

export type StatutTerritoire = 'ouvert' | 'preparation' | 'ferme';

export const STATUTS_TERRITOIRE: Record<StatutTerritoire, { libelle: string; aide: string }> = {
  ouvert: { libelle: 'Ouvert', aide: 'PROXIMA y réalise des missions.' },
  preparation: { libelle: 'En préparation', aide: 'Constitution du vivier avant l’ouverture commerciale.' },
  ferme: { libelle: 'Fermé', aide: 'Pas d’activité prévue pour le moment.' },
};

export interface EtatTerritoire {
  statut: StatutTerritoire;
  objectif_profils: number | null;
  /** profils verifies ou actifs */
  mobilisables: number;
  /** profils demandes par les missions en recrutement ou en cours */
  besoin: number;
  en_cours: number;
  missions_12m: number;
}

export type NiveauSignal = 'danger' | 'alerte' | 'ok';

/** Ce qu'il faut savoir d'un territoire, du plus urgent au plus rassurant. */
export function signauxTerritoire(t: EtatTerritoire): { niveau: NiveauSignal; message: string }[] {
  const s: { niveau: NiveauSignal; message: string }[] = [];
  if (t.besoin > t.mobilisables) {
    s.push({ niveau: 'danger', message: `Demande sans vivier : ${t.besoin} profils demandés, ${t.mobilisables} mobilisable${t.mobilisables > 1 ? 's' : ''}.` });
  }
  if (t.statut !== 'ouvert' && (t.en_cours > 0 || t.missions_12m > 0)) {
    s.push({ niveau: 'alerte', message: 'Missions dans un territoire qui n’est pas ouvert : à ouvrir, ou à rattacher ailleurs.' });
  }
  if (t.statut === 'ouvert' && t.objectif_profils && t.mobilisables < t.objectif_profils / 2) {
    s.push({ niveau: 'alerte', message: `Vivier insuffisant : ${t.mobilisables} sur un objectif de ${t.objectif_profils}.` });
  }
  if (t.statut === 'preparation' && t.objectif_profils && t.mobilisables >= t.objectif_profils) {
    s.push({ niveau: 'ok', message: 'Objectif de vivier atteint : le territoire peut ouvrir.' });
  }
  return s;
}

/** Avancement vers l'objectif de profils mobilisables (null sans objectif). */
export function avancement(mobilisables: number, objectif: number | null): number | null {
  if (!objectif) return null;
  return Math.min(1, mobilisables / objectif);
}
