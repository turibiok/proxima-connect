import 'server-only';
import { requete, une } from '@/lib/db';
import type { Affectation } from './regles';

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
}

export function chargerEquipe(missionId: string) {
  return requete<LigneEquipe>(
    `SELECT a.id, a.role, a.reponse, a.presence, a.remplace_affectation_id, a.proposee_le, a.reponse_le,
            a.canal_proposition, a.motif_refus, a.remuneration_proposee_fcfa,
            i.id AS intervenant_id, i.nom, i.prenoms, i.reference, i.telephone, i.whatsapp, i.score
       FROM affectation a JOIN intervenant i ON i.id = a.intervenant_id
      WHERE a.mission_id = $1
      ORDER BY a.role, a.cree_le`,
    [missionId],
  );
}
