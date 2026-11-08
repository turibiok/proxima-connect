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
  connexion_bloquee: 'Connexion bloquée (trop de tentatives)',
  mot_de_passe: 'Mot de passe changé',
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
  evaluation: 'Évaluation de mission',
  evaluation_modification: 'Évaluation modifiée',
  evaluation_contestation: 'Évaluation contestée',
  evaluation_contestation_traitee: 'Contestation traitée',
  ponderation: 'Pondération du score modifiée',
  paiements_generes: 'Paiements des intervenants à verser',
  paiements_retires: 'Paiements non versés retirés',
  paiement_verse: 'Intervenant payé',
  paiement_litige: 'Paiement mis en litige',
  paiement_litige_leve: 'Litige de paiement levé',
  consultation_paiements: 'Consultation des comptes de paiement',
  facture_emission: 'Facture émise',
  facture_reglement: 'Règlement reçu',
  facture_annulation: 'Facture annulée',
  rapport_preparation: 'Rapport client préparé',
  rapport_transmission: 'Rapport transmis au client',
  satisfaction_client: 'Avis du client enregistré',
  export_donnees: 'Export de données',
  communication_envoi: 'Message envoyé à l’intervenant',
  communication_echange: 'Échange consigné avec l’intervenant',
  espace_lien: 'Lien d’accès à l’espace préparé',
  espace_connexion: 'Connexion à l’espace intervenant',
  espace_echec: 'Échec d’ouverture de l’espace (date de naissance)',
  espace_fermeture: 'Accès à l’espace fermés',
  selection_automatique: 'Profils choisis et sollicités automatiquement',
  selection_auto_reglage: 'Sélection automatique réglée',
  taches_automatiques: 'Tâches automatiques exécutées',
  client_connexion: 'Connexion à l’espace client',
  client_connexion_echec: 'Échec de connexion à l’espace client',
  client_mot_de_passe: 'Mot de passe client changé',
  client_compte_creation: 'Accès client créé',
  client_compte_reinitialisation: 'Accès client réinitialisé',
  client_compte_etat: 'Accès client activé ou désactivé',
  compte_creation: 'Création de compte',
  compte_reinitialisation: 'Mot de passe réinitialisé par un administrateur',
  compte_etat: 'Activation / désactivation de compte',
};
