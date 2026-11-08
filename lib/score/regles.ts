/**
 * PROXIMA SCORE (cahier des charges 5.5).
 *
 * Score interne de 0 a 100 par intervenant, moyenne ponderee de huit
 * criteres dont les poids sont parametrables :
 *   - six criteres notes de 1 a 5 a chaque evaluation de mission
 *     (ponctualite, qualite, consignes, exactitude, comportement, client) ;
 *   - deux criteres calcules : taux de presence et nombre de missions
 *     realisees.
 *
 * Module pur, teste par tests/score.test.mjs : le meme calcul sert a
 * l'enregistrement et a l'explication affichee a l'intervenant.
 */

export type CodeCritere =
  | 'ponctualite'
  | 'presence'
  | 'missions_realisees'
  | 'qualite'
  | 'consignes'
  | 'exactitude'
  | 'comportement'
  | 'client';

/** Criteres notes par l'equipe a l'issue d'une mission (le client, s'il a donne son avis). */
export const CRITERES_NOTES: { code: CodeCritere; libelle: string; aide: string; facultatif?: boolean }[] = [
  { code: 'ponctualite', libelle: 'Ponctualité', aide: 'Arrivé à l’heure au briefing et sur le terrain' },
  { code: 'qualite', libelle: 'Qualité du travail', aide: 'Travail soigné, objectifs atteints' },
  { code: 'consignes', libelle: 'Respect des consignes', aide: 'Zone, horaires, tenue, déroulé' },
  { code: 'exactitude', libelle: 'Exactitude des données', aide: 'Données et preuves justes, peu de rejets' },
  { code: 'comportement', libelle: 'Comportement', aide: 'Attitude avec le public, l’équipe et le client' },
  { code: 'client', libelle: 'Évaluation du client', aide: 'Avis du client, s’il l’a donné', facultatif: true },
];

export const ECHELLE: Record<number, string> = {
  1: 'Insuffisant',
  2: 'Passable',
  3: 'Correct',
  4: 'Bien',
  5: 'Excellent',
};

/** Nombre de missions realisees qui donne la note pleine au critere « missions realisees ». */
export const PALIER_MISSIONS = 10;

/** Seules les evaluations les plus recentes comptent : le score suit les progres. */
export const EVALUATIONS_RETENUES = 10;

export type Notes = Partial<Record<CodeCritere, number | null>>;

export interface Donnees {
  poids: Partial<Record<CodeCritere, number>>;
  /** Evaluations retenues (non annulees), de la plus recente a la plus ancienne. */
  evaluations: { notes: Notes }[];
  /** Presences des titulaires pointees : notees = present + retard + absent ; presentes = present + retard. */
  presence: { notees: number; presentes: number };
  missionsRealisees: number;
}

export interface LigneDetail {
  code: CodeCritere;
  /** 0 a 100, ou null si aucune donnee pour ce critere. */
  valeur: number | null;
  poids: number;
  /** D'ou vient la valeur, en clair. */
  base: string;
}

const arrondi = (n: number) => Math.round(n * 10) / 10;

/** Note 1 a 5 ramenee sur 100 : 1 -> 0, 3 -> 50, 5 -> 100. */
export const noteSurCent = (note: number) => ((note - 1) / 4) * 100;

export function calculerScore(d: Donnees): { score: number | null; detail: LigneDetail[] } {
  const poids = (c: CodeCritere) => Math.max(0, d.poids[c] ?? 0);
  const detail: LigneDetail[] = [];

  for (const { code } of CRITERES_NOTES) {
    const notes = d.evaluations
      .map((e) => e.notes[code])
      .filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 5);
    const moyenne = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
    detail.push({
      code,
      valeur: moyenne === null ? null : arrondi(noteSurCent(moyenne)),
      poids: poids(code),
      base: moyenne === null ? 'Pas encore noté' : `${moyenne.toFixed(1).replace('.', ',')} / 5 sur ${notes.length} évaluation${notes.length > 1 ? 's' : ''}`,
    });
  }

  const { notees, presentes } = d.presence;
  detail.push({
    code: 'presence',
    valeur: notees ? arrondi((presentes / notees) * 100) : null,
    poids: poids('presence'),
    base: notees ? `${presentes} présence${presentes > 1 ? 's' : ''} sur ${notees} mission${notees > 1 ? 's' : ''}` : 'Aucune présence pointée',
  });

  const sansDonnees = !d.evaluations.length && !notees;
  detail.push({
    code: 'missions_realisees',
    valeur: sansDonnees ? null : arrondi((Math.min(d.missionsRealisees, PALIER_MISSIONS) / PALIER_MISSIONS) * 100),
    poids: poids('missions_realisees'),
    base: `${d.missionsRealisees} mission${d.missionsRealisees > 1 ? 's' : ''} réalisée${d.missionsRealisees > 1 ? 's' : ''} (pleine note à ${PALIER_MISSIONS})`,
  });

  // Un critere sans donnee ne compte pas : son poids est reparti sur les
  // autres. Sans evaluation ni presence, il n'y a pas de score (profil neuf).
  const utiles = detail.filter((l) => l.valeur !== null && l.poids > 0);
  const total = utiles.reduce((t, l) => t + l.poids, 0);
  if (sansDonnees || !total) return { score: null, detail };
  const score = utiles.reduce((t, l) => t + l.valeur! * l.poids, 0) / total;
  return { score: arrondi(score), detail };
}

// ------------------------------------------------------------ saisie

interface FormLike {
  get(k: string): unknown;
}

/** Lit une evaluation (ou une correction) : cinq notes obligatoires, l'avis du client facultatif. */
export function lireEvaluation(f: FormLike): { ok: true; notes: Notes; commentaire: string | null } | { ok: false; erreurs: Record<string, string> } {
  const erreurs: Record<string, string> = {};
  const notes: Notes = {};
  for (const c of CRITERES_NOTES) {
    const brut = String(f.get(c.code) ?? '').trim();
    if (!brut) {
      if (!c.facultatif) erreurs[c.code] = 'Notez ce critère.';
      else notes[c.code] = null;
      continue;
    }
    const n = Number(brut);
    if (!Number.isInteger(n) || n < 1 || n > 5) erreurs[c.code] = 'Note de 1 à 5.';
    else notes[c.code] = n;
  }
  const commentaire = String(f.get('commentaire') ?? '').trim().slice(0, 1000) || null;
  // une note basse doit etre expliquee : l'intervenant peut la contester
  const basses = CRITERES_NOTES.filter((c) => typeof notes[c.code] === 'number' && (notes[c.code] as number) <= 2);
  if (basses.length && !commentaire) erreurs.commentaire = 'Expliquez les notes de 1 ou 2 : l’intervenant y a droit.';
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, notes, commentaire };
}

// ------------------------------------------------------------ contestation

export const ISSUES = {
  maintenue: 'Évaluation maintenue',
  corrigee: 'Évaluation corrigée',
  annulee: 'Évaluation annulée',
} as const;
export type Issue = keyof typeof ISSUES;

/**
 * Qui peut trancher une contestation : pas l'auteur de l'evaluation
 * contestee, sauf un administrateur (petite equipe, personne d'autre).
 */
export function peutTrancher(e: { evaluee_par: string | null }, utilisateur: { id: string; role: string }): boolean {
  return utilisateur.role === 'admin' || e.evaluee_par !== utilisateur.id;
}

/** Evolution depuis l'etat precedent, pour l'affichage (null si un seul point). */
export function evolution(historique: { score: number }[]): number | null {
  if (historique.length < 2) return null;
  return arrondi(historique[0].score - historique[1].score);
}
