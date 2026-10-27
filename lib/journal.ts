import 'server-only';
import type { PoolClient } from 'pg';
import { requete } from '@/lib/db';
import { origine } from '@/lib/auth/session';

/**
 * Trace des acces et modifications (cahier des charges 8.1).
 *
 * `client` permet d'ecrire dans la transaction de la modification elle-meme :
 * une modification annulee ne laisse pas de ligne de journal, et une
 * modification enregistree en laisse toujours une.
 */
export async function consigner(
  e: { utilisateurId: string | null; action: string; entite: string; entiteId?: string | null; details?: object },
  client?: PoolClient,
) {
  const { ip } = await origine();
  const sql = `INSERT INTO journal (utilisateur_id, action, entite, entite_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [e.utilisateurId, e.action, e.entite, e.entiteId ?? null, e.details ? JSON.stringify(e.details) : null, ip];
  if (client) await client.query(sql, params);
  else await requete(sql, params);
}

export const LIBELLES_ACTIONS: Record<string, string> = {
  connexion: 'Connexion',
  connexion_echec: 'Échec de connexion',
  inscription: 'Inscription (formulaire public)',
  creation_interne: 'Profil saisi par l’équipe',
  modification: 'Modification',
  consultation_sensible: 'Consultation des données sensibles',
  controle: 'Contrôle de vérification',
  statut: 'Changement de statut',
  client_creation: 'Fiche client créée',
  client_modification: 'Fiche client modifiée',
  client_statut: 'Statut commercial modifié',
  brief_creation: 'Brief saisi',
  brief_modification: 'Brief modifié',
  brief_statut: 'Statut du brief modifié',
  mission_creation: 'Mission créée',
  mission_modification: 'Mission modifiée',
  mission_statut: 'Étape de mission',
  mission_briefing: 'Briefing enregistré',
  affectation_ajout: 'Profils ajoutés à l’équipe',
  affectation_proposition: 'Proposition envoyée',
  affectation_reponse: 'Réponse enregistrée',
  affectation_retrait: 'Retiré de l’équipe',
  affectation_presence: 'Présence notée',
  affectation_remplacement: 'Remplacement',
  preuve_ajout: 'Preuve ajoutée',
  preuve_statut: 'Preuve contrôlée',
  controle_qualite: 'Contrôle qualité',
  incident_declaration: 'Incident déclaré',
  incident_resolution: 'Incident résolu',
  fichier_telechargement: 'Fichier téléchargé',
  compte_creation: 'Création de compte',
  compte_etat: 'Activation / désactivation de compte',
};
