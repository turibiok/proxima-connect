/**
 * Regles metier des missions (cahier des charges 5.3 et parcours section 6).
 *
 * Module pur, teste par tests/missions.test.mjs : statuts et conditions de
 * passage, composition de l'equipe et remplacements, compatibilite d'un
 * profil avec un besoin, texte de la proposition envoyee a l'intervenant.
 */

import { periode } from '../format.ts';
import { formaterFCFA, lireMontant } from '../clients/regles.ts';
import { CATEGORIES_MISSIONS } from '../referentiel.ts';
import { restesAControler, type Bilan } from '../preuves/regles.ts';

// ------------------------------------------------------------ statuts

export type StatutMission =
  | 'brief_recu'
  | 'selection'
  | 'preparation'
  | 'execution'
  | 'preuves_collectees'
  | 'controlee'
  | 'rapport_transmis'
  | 'payee'
  | 'annulee';

/** Les etapes du cahier des charges, dans l'ordre. `module` : etape qui s'ouvrira avec un module a venir. */
export const ETAPES: { code: Exclude<StatutMission, 'annulee'>; libelle: string; module?: string }[] = [
  { code: 'brief_recu', libelle: 'Brief reçu' },
  { code: 'selection', libelle: 'Sélection en cours' },
  { code: 'preparation', libelle: 'Briefing / préparation' },
  { code: 'execution', libelle: 'En cours d’exécution' },
  { code: 'preuves_collectees', libelle: 'Preuves collectées' },
  { code: 'controlee', libelle: 'Contrôlée' },
  { code: 'rapport_transmis', libelle: 'Rapport transmis', module: '5.7 Reporting' },
  { code: 'payee', libelle: 'Payée' },
];

export const LIBELLES_STATUT_MISSION: Record<StatutMission, string> = {
  ...(Object.fromEntries(ETAPES.map((e) => [e.code, e.libelle])) as Record<Exclude<StatutMission, 'annulee'>, string>),
  annulee: 'Annulée',
};

const rang = (s: StatutMission) => ETAPES.findIndex((e) => e.code === s);

export interface EtatMission {
  /** Intervenants engages : titulaires ayant accepte, non remplaces. */
  engages: number;
  requis: number;
  briefing: boolean;
  /** Engages dont la presence n'est pas encore notee. */
  presencesManquantes: number;
  /** Etat des preuves et incidents (module 5.4). */
  bilan?: Bilan;
  /** Paiements et factures de la mission (module 5.6). */
  finances?: {
    /** Paiements d'intervenants a payer ou en litige. */
    paiementsOuverts: number;
    /** Factures (hors acomptes) emises et non annulees. */
    factures: number;
    /** Factures et acomptes non annules, pas encore soldes. */
    nonSoldees: number;
  };
}

/**
 * Message d'erreur si le passage de `de` a `vers` est refuse, null sinon.
 *
 * On avance d'une etape a la fois, chacune avec sa condition ; on peut
 * revenir d'une etape en arriere (erreur de manipulation) ; on peut annuler
 * a tout moment avant la fin, avec un motif.
 */
export function refusTransition(de: StatutMission, vers: StatutMission, e: EtatMission, motif = ''): string | null {
  if (de === 'annulee' || de === 'payee') return 'Cette mission est close.';
  if (vers === 'annulee') return motif.trim() ? null : 'Indiquez le motif de l’annulation.';

  const ecart = rang(vers) - rang(de);
  if (ecart === -1) return vers === 'brief_recu' ? 'Une mission créée ne revient pas à l’étape du brief.' : null;
  if (ecart !== 1) return 'Les étapes se franchissent une à une.';

  const etape = ETAPES[rang(vers)];
  if (etape.module) return `Cette étape s’ouvrira avec le module ${etape.module}.`;

  switch (vers) {
    case 'preparation':
      return e.engages > 0 ? null : 'Aucun intervenant n’a encore accepté la proposition.';
    case 'execution':
      if (!e.briefing) return 'Enregistrez le briefing avant de lancer la mission.';
      return e.engages > 0 ? null : 'Aucun intervenant engagé.';
    case 'preuves_collectees':
      return e.presencesManquantes === 0
        ? null
        : `Notez la présence de chaque intervenant engagé (${e.presencesManquantes} manquante${e.presencesManquantes > 1 ? 's' : ''}).`;
    case 'controlee': {
      const restes = restesAControler(e.bilan ?? { validees: 0, enAttente: 0, rejetees: 0, incidentsBloquants: 0 });
      return restes.length ? restes.join(' ') : null;
    }
    case 'payee': {
      // parcours, etape 14 : les intervenants sont payes et la facture client est soldee
      const fi = e.finances ?? { paiementsOuverts: 0, factures: 0, nonSoldees: 0 };
      const restes: string[] = [];
      if (fi.paiementsOuverts) restes.push(`${fi.paiementsOuverts} paiement${fi.paiementsOuverts > 1 ? 's' : ''} d’intervenant à régler.`);
      if (!fi.factures) restes.push('Émettez la facture du client.');
      else if (fi.nonSoldees) restes.push(`${fi.nonSoldees} facture${fi.nonSoldees > 1 ? 's' : ''} du client à encaisser.`);
      return restes.length ? restes.join(' ') : null;
    }
    default:
      return null;
  }
}

/** Etapes accessibles depuis `de`, pour l'interface (la condition est verifiee a part). */
export function etapesVoisines(de: StatutMission): { suivante: StatutMission | null; precedente: StatutMission | null } {
  if (de === 'annulee' || de === 'payee') return { suivante: null, precedente: null };
  const r = rang(de);
  return {
    suivante: ETAPES[r + 1]?.code ?? null,
    precedente: r > 1 ? ETAPES[r - 1].code : null,
  };
}

// ------------------------------------------------------------ equipe

export interface Affectation {
  id: string;
  role: 'titulaire' | 'remplacant';
  reponse: 'en_attente' | 'accepte' | 'refuse';
  presence: 'present' | 'retard' | 'absent' | null;
  remplace_affectation_id: string | null;
  proposee_le?: Date | string | null;
}

export function equipe(affs: Affectation[]) {
  const remplaces = new Set(affs.map((a) => a.remplace_affectation_id).filter((x): x is string => !!x));
  const engages = affs.filter((a) => a.role === 'titulaire' && a.reponse === 'accepte' && !remplaces.has(a.id));
  const titulairesNotes = affs.filter((a) => a.role === 'titulaire' && a.presence);
  const presents = titulairesNotes.filter((a) => a.presence !== 'absent').length;
  return {
    engages,
    remplaces,
    /** Remplacants ayant accepte d'etre en reserve, pas encore mobilises. */
    reserve: affs.filter((a) => a.role === 'remplacant' && a.reponse === 'accepte'),
    enAttente: affs.filter((a) => a.reponse === 'en_attente' && a.proposee_le),
    aProposer: affs.filter((a) => a.reponse === 'en_attente' && !a.proposee_le),
    presencesManquantes: engages.filter((a) => !a.presence).length,
    /** Taux de presence des titulaires (remplaces compris) : cible 95 % (section 11). */
    tauxPresence: titulairesNotes.length ? presents / titulairesNotes.length : null,
  };
}

/** Un titulaire peut etre remplace s'il est absent ou s'il a refuse, et pas encore remplace. */
export function remplacable(a: Affectation, remplaces: Set<string>): boolean {
  return a.role === 'titulaire' && !remplaces.has(a.id) && (a.presence === 'absent' || a.reponse === 'refuse');
}

// ------------------------------------------------------------ economie

/** Cout des intervenants et marge brute, si budget et remuneration sont connus. */
export function economie(budget: number | null, remuneration: number | null, effectif: number) {
  if (remuneration === null) return null;
  const cout = remuneration * effectif;
  if (budget === null || budget === 0) return { cout, marge: null, taux: null };
  return { cout, marge: budget - cout, taux: (budget - cout) / budget };
}

// ------------------------------------------------------------ compatibilite

const JOURS_SEMAINE = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Jours de la semaine couverts par la mission ; null si les dates ne sont pas fixees. */
export function joursMission(debut: string | null, fin: string | null): string[] | null {
  if (!debut) return null;
  const d = new Date(`${debut}T12:00:00Z`);
  const f = new Date(`${fin ?? debut}T12:00:00Z`);
  const jours = new Set<string>();
  for (let t = d.getTime(), n = 0; t <= f.getTime() && n < 7; t += 86_400_000, n++) {
    jours.add(JOURS_SEMAINE[new Date(t).getUTCDay()]);
  }
  return JOURS_SEMAINE.filter((j) => jours.has(j));
}

/** Les periodes [debut, fin] se chevauchent-elles ? Dates AAAA-MM-JJ, fin absente = un seul jour. */
export function chevauchement(a: { debut: string | null; fin: string | null }, b: { debut: string | null; fin: string | null }): boolean {
  if (!a.debut || !b.debut) return false;
  return a.debut <= (b.fin ?? b.debut) && b.debut <= (a.fin ?? a.debut);
}

const simplifier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** « Cotonou : Dantokpa, Ganhi et Akpakpa » -> [cotonou, dantokpa, ganhi, akpakpa] */
export function lieux(zone: string | null): string[] {
  if (!zone) return [];
  return [...new Set(simplifier(zone).split(/[,;:/()]|\s+et\s+|\s+-\s+/).map((s) => s.trim()).filter((s) => s.length >= 3))];
}

export interface Besoin {
  categorie: string;
  zone: string | null;
  jours: string[] | null;
  competences: string[];
  score_minimum: number | null;
}

export interface Candidat {
  ville: string;
  quartier: string | null;
  zones: string[];
  categories_missions: string[];
  jours_disponibles: string[];
  competences: string[];
  score: number | null;
}

export interface Critere {
  code: 'categorie' | 'zone' | 'jours' | 'competences' | 'score' | 'disponible';
  libelle: string;
  /** null : critere sans objet pour ce besoin (non bloquant, points pleins). */
  ok: boolean | null;
  detail: string;
}

const POIDS = { categorie: 30, zone: 30, jours: 20, competences: 10, score: 10 };

/**
 * Compatibilite d'un profil avec le besoin de la mission.
 *
 * Bloquants (le profil reste visible mais n'est pas « eligible ») : type de
 * mission non accepte, score sous le minimum, deja engage sur une mission
 * aux dates qui se chevauchent. Le reste module seulement le classement.
 */
export function compatibilite(b: Besoin, p: Candidat, dejaEngage: boolean) {
  const criteres: Critere[] = [];
  let points = 0;

  const cat = p.categories_missions.includes(b.categorie);
  criteres.push({ code: 'categorie', libelle: 'Type de mission', ok: cat, detail: cat ? 'Accepté' : 'Non accepté par le profil' });
  if (cat) points += POIDS.categorie;

  const voulus = lieux(b.zone);
  if (!voulus.length) {
    criteres.push({ code: 'zone', libelle: 'Zone', ok: null, detail: 'Zone non précisée' });
    points += POIDS.zone;
  } else {
    const siens = [p.ville, p.quartier ?? '', ...p.zones].map(simplifier).filter(Boolean);
    const communs = voulus.filter((v) => siens.some((s) => s === v || s.includes(v) || v.includes(s)));
    const ok = communs.length > 0;
    criteres.push({ code: 'zone', libelle: 'Zone', ok, detail: ok ? `Couvre ${communs.join(', ')}` : 'Hors zone' });
    if (ok) points += POIDS.zone;
  }

  if (!b.jours) {
    criteres.push({ code: 'jours', libelle: 'Disponibilité', ok: null, detail: 'Dates à fixer' });
    points += POIDS.jours;
  } else {
    const couverts = b.jours.filter((j) => p.jours_disponibles.includes(j)).length;
    criteres.push({
      code: 'jours',
      libelle: 'Disponibilité',
      ok: couverts === b.jours.length,
      detail: couverts === b.jours.length ? 'Disponible tous les jours' : `${couverts} jour${couverts > 1 ? 's' : ''} sur ${b.jours.length}`,
    });
    points += Math.round((POIDS.jours * couverts) / b.jours.length);
  }

  if (!b.competences.length) {
    criteres.push({ code: 'competences', libelle: 'Compétences', ok: null, detail: 'Aucune exigée' });
    points += POIDS.competences;
  } else {
    const siennes = p.competences.map(simplifier);
    const trouvees = b.competences.filter((c) => siennes.some((s) => s.includes(simplifier(c)) || simplifier(c).includes(s)));
    criteres.push({
      code: 'competences',
      libelle: 'Compétences',
      ok: trouvees.length === b.competences.length,
      detail: `${trouvees.length} sur ${b.competences.length}`,
    });
    points += Math.round((POIDS.competences * trouvees.length) / b.competences.length);
  }

  let scoreOk: boolean | null = null;
  if (p.score === null) {
    criteres.push({ code: 'score', libelle: 'PROXIMA SCORE', ok: null, detail: 'Nouveau profil, pas encore noté' });
    points += POIDS.score / 2;
  } else {
    scoreOk = b.score_minimum === null || p.score >= b.score_minimum;
    criteres.push({
      code: 'score',
      libelle: 'PROXIMA SCORE',
      ok: scoreOk,
      detail: `${Math.round(p.score)}${b.score_minimum !== null ? ` (minimum ${b.score_minimum})` : ''}`,
    });
    points += Math.round((POIDS.score * p.score) / 100);
  }

  criteres.push({
    code: 'disponible',
    libelle: 'Planning',
    ok: !dejaEngage,
    detail: dejaEngage ? 'Déjà engagé sur une mission aux mêmes dates' : 'Libre',
  });

  return { points, eligible: cat && scoreOk !== false && !dejaEngage, criteres };
}

// ------------------------------------------------------------ proposition

export interface Proposition {
  prenom: string;
  titre: string;
  lieu: string | null;
  zone: string | null;
  date_debut: string | null;
  date_fin: string | null;
  horaires: string | null;
  remuneration: number;
  objectifs: string | null;
  role: 'titulaire' | 'remplacant';
}

/**
 * Texte de la proposition, conditions annoncees a l'avance (cahier des
 * charges 5.3) : remuneration, lieu, horaires, objectifs. Court, pour tenir
 * dans un SMS long ou un message WhatsApp lisible sur un petit ecran.
 */
export function messageProposition(p: Proposition): string {
  const lignes = [
    `Bonjour ${p.prenom.split(/\s+/)[0]},`,
    p.role === 'remplacant'
      ? `PROXIMA CONNECT vous propose d'être en réserve (remplaçant) pour la mission « ${p.titre} ».`
      : `PROXIMA CONNECT vous propose la mission « ${p.titre} ».`,
    `- Lieu : ${p.lieu ?? p.zone ?? 'à préciser'}`,
    `- Dates : ${periode(p.date_debut, p.date_fin)}`,
    p.horaires && `- Horaires : ${p.horaires}`,
    `- Rémunération : ${formaterFCFA(p.remuneration).replace(/[  ]/g, ' ')}${p.role === 'remplacant' ? ' si vous êtes mobilisé(e)' : ''}`,
    p.objectifs && `- Objectif : ${p.objectifs.length > 160 ? `${p.objectifs.slice(0, 157)}…` : p.objectifs}`,
    'Répondez OUI pour accepter ou NON pour refuser.',
  ];
  return lignes.filter(Boolean).join('\n');
}

// ------------------------------------------------------------ formulaire

export interface FicheMission {
  titre: string;
  categorie: string;
  type_mission: string | null;
  zone: string | null;
  lieu: string | null;
  date_debut: string | null;
  date_fin: string | null;
  horaires: string | null;
  nb_profils_requis: number;
  remuneration_agent_fcfa: number | null;
  budget_fcfa: number | null;
  objectifs: string | null;
  livrables: string | null;
  competences: string[];
  score_minimum: number | null;
}

interface FormLike {
  get(k: string): unknown;
  getAll(k: string): unknown[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lireMission(f: FormLike): { ok: true; donnees: FicheMission } | { ok: false; erreurs: Record<string, string> } {
  const t = (k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
  const erreurs: Record<string, string> = {};

  const [cat, type] = t('type_mission').split('::');
  const categorie = CATEGORIES_MISSIONS.find((c) => c.code === cat);
  if (!categorie) erreurs.type_mission = 'Choisissez le type de mission.';

  const nb = Number(t('nb_profils_requis') || '1');
  if (!Number.isInteger(nb) || nb < 1 || nb > 500) erreurs.nb_profils_requis = 'Entre 1 et 500 personnes.';

  const remuneration = lireMontant(t('remuneration_agent_fcfa'));
  if (Number.isNaN(remuneration)) erreurs.remuneration_agent_fcfa = 'Montant invalide (en FCFA, sans décimales).';
  const budget = lireMontant(t('budget_fcfa'));
  if (Number.isNaN(budget)) erreurs.budget_fcfa = 'Montant invalide (en FCFA, sans décimales).';

  const scoreSaisi = t('score_minimum');
  const score = scoreSaisi ? Number(scoreSaisi) : null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) erreurs.score_minimum = 'Entre 0 et 100.';

  const debut = t('date_debut');
  const fin = t('date_fin');
  if (debut && !DATE.test(debut)) erreurs.date_debut = 'Date invalide.';
  if (fin && !DATE.test(fin)) erreurs.date_fin = 'Date invalide.';
  if (DATE.test(debut) && DATE.test(fin) && fin < debut) erreurs.date_fin = 'La date de fin précède la date de début.';
  if (fin && !debut) erreurs.date_debut = 'Indiquez aussi la date de début.';

  const d: FicheMission = {
    titre: t('titre', 160),
    categorie: categorie?.code ?? '',
    type_mission: categorie && type && categorie.types.includes(type) ? type : null,
    zone: t('zone') || null,
    lieu: t('lieu') || null,
    date_debut: debut || null,
    date_fin: fin || null,
    horaires: t('horaires', 120) || null,
    nb_profils_requis: nb,
    remuneration_agent_fcfa: remuneration !== null && !Number.isNaN(remuneration) ? remuneration : null,
    budget_fcfa: budget !== null && !Number.isNaN(budget) ? budget : null,
    objectifs: t('objectifs', 2000) || null,
    livrables: t('livrables', 2000) || null,
    competences: [...new Set(t('competences', 600).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 30),
    score_minimum: score,
  };
  if (!d.titre) erreurs.titre = 'Donnez un titre à la mission.';

  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: d };
}
