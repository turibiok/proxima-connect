import 'server-only';
import { requete } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { ajouterJours, aujourdhuiBenin } from '@/lib/finances/regles';
import { messageConfirmationPaiement, messageRappel } from '@/lib/communication/regles';
import { configFournisseur, envoiAutomatiquePossible, etapeProposition, messageRelance } from './regles';
import { envoyerAutomatique } from './envoi';
import { enregistrerReponse } from './reponses';
import { completerEquipe } from './selection';

export interface BilanTaches {
  fournisseur: string;
  expirees: number;
  relances: number;
  rappels: number;
  confirmations: number;
  ajoutes: number;
  echecs: number;
}

/**
 * Taches automatiques (phase 3), lancees par le planificateur (frequence dans vercel.json)
 * ou a la main depuis Parametres. Chaque tache est independante : l'echec
 * de l'une n'empeche pas les autres. Sans fournisseur d'envoi, seules les
 * taches sans message tournent (aucun message n'est marque envoye a tort).
 */
export async function executerTaches(declencheur: 'planificateur' | 'manuel', utilisateurId: string | null = null): Promise<BilanTaches> {
  const debut = Date.now();
  const config = configFournisseur(process.env);
  const envoi = envoiAutomatiquePossible(config);
  const b: BilanTaches = { fournisseur: config.mode, expirees: 0, relances: 0, rappels: 0, confirmations: 0, ajoutes: 0, echecs: 0 };
  const erreurs: string[] = [];
  const etape = async (nom: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      erreurs.push(`${nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const compter = (r: { ok: boolean }) => (r.ok ? 1 : (b.echecs++, 0));

  // 1. propositions envoyees automatiquement : relance a mi-delai, expiration au terme
  await etape('propositions', async () => {
    const props = await requete<{ id: string; intervenant_id: string; mission_id: string; proposee_le: Date; proposition_expire_le: Date; relance_le: Date | null; prenoms: string; titre: string }>(
      `SELECT a.id, a.intervenant_id, a.mission_id, a.proposee_le, a.proposition_expire_le, a.relance_le, i.prenoms, m.titre
         FROM affectation a JOIN mission m ON m.id = a.mission_id JOIN intervenant i ON i.id = a.intervenant_id
        WHERE a.reponse = 'en_attente' AND a.proposee_le IS NOT NULL AND a.proposition_expire_le IS NOT NULL
          AND m.statut IN ('selection', 'preparation', 'execution')`,
    );
    for (const p of props) {
      const e = etapeProposition(p);
      if (e === 'expiree') {
        const r = await enregistrerReponse(p.id, 'refuse', 'delai', 'Sans réponse dans le délai');
        if (r.ok) b.expirees++;
      } else if (e === 'a_relancer' && envoi) {
        const r = await envoyerAutomatique({ intervenantId: p.intervenant_id, missionId: p.mission_id, modele: 'relance', texte: messageRelance(p.prenoms, p.titre, new Date(p.proposition_expire_le)) });
        await requete('UPDATE affectation SET relance_le = now() WHERE id = $1', [p.id]);
        b.relances += compter(r);
      }
    }
  });

  // 2. rappel la veille du demarrage, a chaque engage qui ne l'a pas encore recu
  await etape('rappels', async () => {
    if (!envoi) return;
    const demain = ajouterJours(aujourdhuiBenin(), 1);
    const lignes = await requete<{ intervenant_id: string; prenoms: string; mission_id: string; titre: string; date_debut: string; horaires: string | null; lieu: string | null; zone: string | null }>(
      `SELECT a.intervenant_id, i.prenoms, m.id AS mission_id, m.titre, m.date_debut, m.horaires, m.lieu, m.zone
         FROM affectation a JOIN mission m ON m.id = a.mission_id JOIN intervenant i ON i.id = a.intervenant_id
        WHERE m.statut IN ('preparation', 'execution') AND m.date_debut = $1::date
          AND a.role = 'titulaire' AND a.reponse = 'accepte'
          AND NOT EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM communication c WHERE c.mission_id = m.id AND c.intervenant_id = a.intervenant_id AND c.modele = 'rappel')`,
      [demain],
    );
    for (const l of lignes) {
      const r = await envoyerAutomatique({
        intervenantId: l.intervenant_id, missionId: l.mission_id, modele: 'rappel',
        texte: messageRappel({ prenoms: l.prenoms, titre: l.titre, date_debut: l.date_debut, horaires: l.horaires, lieu: l.lieu, zone: l.zone, aujourdhui: aujourdhuiBenin() }),
      });
      b.rappels += compter(r);
    }
  });

  // 3. confirmation des paiements verses ces 7 derniers jours, pas encore confirmes
  await etape('confirmations', async () => {
    if (!envoi) return;
    const payes = await requete<{ id: string; intervenant_id: string; mission_id: string; prenoms: string; montant_fcfa: number; titre: string; reference: string; mode: 'mobile_money' | 'virement' | 'especes'; reference_transaction: string; compte_beneficiaire: string | null }>(
      `SELECT p.id, p.intervenant_id, p.mission_id, i.prenoms, p.montant_fcfa, m.titre, m.reference, p.mode, p.reference_transaction, p.compte_beneficiaire
         FROM paiement_intervenant p JOIN mission m ON m.id = p.mission_id JOIN intervenant i ON i.id = p.intervenant_id
        WHERE p.statut = 'paye' AND p.paye_le > now() - interval '7 days'
          AND NOT EXISTS (SELECT 1 FROM communication c WHERE c.paiement_id = p.id AND c.modele = 'paiement')`,
    );
    for (const p of payes) {
      const r = await envoyerAutomatique({
        intervenantId: p.intervenant_id, missionId: p.mission_id, paiementId: p.id, modele: 'paiement',
        texte: messageConfirmationPaiement({ prenoms: p.prenoms, montant: p.montant_fcfa, titre: p.titre, reference: p.reference, mode: p.mode, referenceTransaction: p.reference_transaction, compte: p.compte_beneficiaire }),
      });
      b.confirmations += compter(r);
    }
  });

  // 4. missions en selection automatique : combler les places liberees
  await etape('selection', async () => {
    const missions = await requete<{ id: string }>(`SELECT id FROM mission WHERE selection_auto AND statut IN ('selection', 'preparation', 'execution')`);
    for (const m of missions) {
      const r = await completerEquipe(m.id, null);
      b.ajoutes += r.titulaires + r.remplacants;
    }
  });

  await requete(
    `INSERT INTO tache_execution (declencheur, duree_ms, resultat, erreur) VALUES ($1, $2, $3, $4)`,
    [declencheur, Date.now() - debut, JSON.stringify(b), erreurs.length ? erreurs.join(' | ') : null],
  );
  if (b.expirees + b.relances + b.rappels + b.confirmations + b.ajoutes + b.echecs > 0 || declencheur === 'manuel') {
    await consigner({ utilisateurId, action: 'taches_automatiques', entite: 'parametre', details: { ...b, declencheur, erreurs: erreurs.length || undefined } });
  }
  return b;
}
