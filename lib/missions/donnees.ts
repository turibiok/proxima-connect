import 'server-only';
import { requete, une } from '@/lib/db';
import { chevauchement, compatibilite, joursMission, type Affectation } from './regles';

export interface ProfilCandidat {
  id: string;
  reference: string;
  nom: string;
  prenoms: string;
  telephone: string;
  whatsapp: string | null;
  ville: string;
  quartier: string | null;
  zones: string[];
  categories_missions: string[];
  jours_disponibles: string[];
  competences: string[];
  score: number | null;
  statut: 'verifie' | 'actif';
  missions_realisees: number;
}

/**
 * Vivier verifie classe pour une mission (cahier des charges 5.3) : meme
 * calcul pour la selection manuelle et la selection automatique (phase 3).
 */
export async function candidatsClasses(m: {
  id: string;
  categorie: string;
  zone: string | null;
  date_debut: string | null;
  date_fin: string | null;
  competences: string[];
  score_minimum: number | null;
}) {
  const [profils, engagements] = await Promise.all([
    requete<ProfilCandidat>(
      `SELECT i.id, i.reference, i.nom, i.prenoms, i.telephone, i.whatsapp, i.ville, i.quartier, i.zones, i.categories_missions,
              i.jours_disponibles, i.competences, i.score, i.statut,
              (SELECT count(*) FROM affectation a WHERE a.intervenant_id = i.id AND a.presence IN ('present', 'retard'))::int AS missions_realisees
         FROM intervenant i WHERE i.statut IN ('verifie', 'actif')`,
    ),
    // engagements acceptes sur d'autres missions vivantes, pour detecter les chevauchements
    requete<{ intervenant_id: string; debut: string | null; fin: string | null; reference: string }>(
      `SELECT a.intervenant_id, m.date_debut AS debut, m.date_fin AS fin, m.reference
         FROM affectation a JOIN mission m ON m.id = a.mission_id
        WHERE a.reponse = 'accepte' AND m.id <> $1 AND m.statut NOT IN ('annulee', 'payee')`,
      [m.id],
    ),
  ]);
  const besoin = {
    categorie: m.categorie,
    zone: m.zone,
    jours: joursMission(m.date_debut, m.date_fin),
    competences: m.competences,
    score_minimum: m.score_minimum,
  };
  const periodeMission = { debut: m.date_debut, fin: m.date_fin };
  const classes = profils
    .map((p) => {
      const conflit = engagements.find((e) => e.intervenant_id === p.id && chevauchement(periodeMission, e));
      return { p, conflit, ...compatibilite(besoin, p, !!conflit) };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.points - a.points || (b.p.score ?? 0) - (a.p.score ?? 0));
  return { besoin, classes };
}

/** Comptes pouvant porter une mission : administrateurs et charges de mission actifs. */
export function responsables() {
  return requete<{ id: string; nom_complet: string }>(
    `SELECT id, nom_complet FROM utilisateur WHERE actif AND role IN ('admin', 'mission') ORDER BY nom_complet`,
  );
}

export function chargerMission(id: string) {
  return une<Record<string, any>>(
    `SELECT m.*, c.raison_sociale, u.nom_complet AS responsable
       FROM mission m JOIN client c ON c.id = m.client_id
       LEFT JOIN utilisateur u ON u.id = m.responsable_id
      WHERE m.id = $1`,
    [id],
  );
}

export interface LigneEquipe extends Affectation {
  intervenant_id: string;
  nom: string;
  prenoms: string;
  reference: string;
  telephone: string;
  whatsapp: string | null;
  score: number | null;
  canal_proposition: string | null;
  reponse_le: Date | null;
  motif_refus: string | null;
  remuneration_proposee_fcfa: number | null;
  origine: 'manuel' | 'automatique';
  reponse_canal: string | null;
  proposition_expire_le: Date | null;
}

export function chargerEquipe(missionId: string) {
  return requete<LigneEquipe>(
    `SELECT a.id, a.role, a.reponse, a.presence, a.remplace_affectation_id, a.proposee_le, a.reponse_le,
            a.canal_proposition, a.motif_refus, a.remuneration_proposee_fcfa, a.origine, a.reponse_canal, a.proposition_expire_le,
            i.id AS intervenant_id, i.nom, i.prenoms, i.reference, i.telephone, i.whatsapp, i.score
       FROM affectation a JOIN intervenant i ON i.id = a.intervenant_id
      WHERE a.mission_id = $1
      ORDER BY a.role, a.cree_le`,
    [missionId],
  );
}
