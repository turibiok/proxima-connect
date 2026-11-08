import 'server-only';
import { transaction, une } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { candidatsClasses } from '@/lib/missions/donnees';
import { messageProposition } from '@/lib/missions/regles';
import { canalAutomatique, choisirCandidats, configFournisseur, envoiAutomatiquePossible, nombreReserve } from './regles';
import { adressePublique, envoyerAutomatique } from './envoi';

const STATUTS_OUVERTS = ['selection', 'preparation', 'execution'];

/**
 * Complete l'equipe d'une mission : choisit les profils compatibles les
 * mieux classes pour les places de titulaire et de reserve encore libres,
 * les ajoute a l'equipe et leur envoie la proposition.
 *
 * Une place est « prise » par un titulaire qui a accepte ou n'a pas encore
 * repondu, et qui n'est ni remplace ni absent. Un profil deja sollicite pour
 * la mission (meme s'il a refuse) n'est jamais repropose.
 */
export async function completerEquipe(
  missionId: string,
  utilisateurId: string | null,
): Promise<{ titulaires: number; remplacants: number; envoye?: boolean; raison?: string }> {
  const m = await une<{
    id: string; reference: string; titre: string; statut: string; categorie: string; zone: string | null; lieu: string | null;
    date_debut: string | null; date_fin: string | null; horaires: string | null; objectifs: string | null; competences: string[];
    score_minimum: number | null; nb_profils_requis: number; remuneration_agent_fcfa: number | null; reserve_pourcent: number; delai_reponse_heures: number;
  }>('SELECT * FROM mission WHERE id = $1', [missionId]);
  if (!m) return { titulaires: 0, remplacants: 0, raison: 'Mission introuvable.' };
  if (!STATUTS_OUVERTS.includes(m.statut)) return { titulaires: 0, remplacants: 0, raison: 'La mission n’est plus en recrutement.' };
  if (m.remuneration_agent_fcfa === null) return { titulaires: 0, remplacants: 0, raison: 'Fixez la rémunération par intervenant : elle fait partie de la proposition.' };

  const { classes } = await candidatsClasses(m);
  const config = configFournisseur(process.env);
  // sans fournisseur, les profils sont ajoutes « a proposer » : l'equipe envoie la proposition
  const envoi = envoiAutomatiquePossible(config);
  const canal = canalAutomatique(config);

  const retenus = await transaction(async (c) => {
    // verrou : deux completions simultanees ne choisissent pas deux fois les memes places
    await c.query('SELECT 1 FROM mission WHERE id = $1 FOR UPDATE', [missionId]);
    const { rows: affs } = await c.query<{ intervenant_id: string; role: string; reponse: string; presence: string | null; remplace: boolean }>(
      `SELECT a.intervenant_id, a.role, a.reponse, a.presence,
              EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id) AS remplace
         FROM affectation a WHERE a.mission_id = $1`,
      [missionId],
    );
    const enLice = (role: string) => affs.filter((a) => a.role === role && a.reponse !== 'refuse' && !a.remplace && a.presence !== 'absent').length;
    const choix = choisirCandidats(
      classes.map((x) => ({ id: x.p.id, eligible: x.eligible, points: x.points, score: x.p.score })),
      {
        titulaires: m.nb_profils_requis - enLice('titulaire'),
        remplacants: nombreReserve(m.nb_profils_requis, m.reserve_pourcent) - enLice('remplacant'),
        exclus: new Set(affs.map((a) => a.intervenant_id)),
      },
    );
    const lignes = [...choix.titulaires.map((id) => ({ id, role: 'titulaire' as const })), ...choix.remplacants.map((id) => ({ id, role: 'remplacant' as const }))];
    for (const l of lignes) {
      if (envoi) {
        await c.query(
          `INSERT INTO affectation (mission_id, intervenant_id, role, origine, proposee_le, canal_proposition, remuneration_proposee_fcfa, proposition_expire_le)
           VALUES ($1, $2, $3, 'automatique', now(), $4, $5, now() + make_interval(hours => $6))`,
          [missionId, l.id, l.role, canal, m.remuneration_agent_fcfa, m.delai_reponse_heures],
        );
      } else {
        await c.query(`INSERT INTO affectation (mission_id, intervenant_id, role, origine) VALUES ($1, $2, $3, 'automatique')`, [missionId, l.id, l.role]);
      }
    }
    if (lignes.length) {
      await consigner(
        { utilisateurId, action: 'selection_automatique', entite: 'mission', entiteId: missionId, details: { reference: m.reference, titulaires: choix.titulaires.length, remplacants: choix.remplacants.length } },
        c,
      );
    }
    return lignes;
  });

  // envois apres l'enregistrement : un message ne part que pour une proposition enregistree
  if (!envoi) {
    return {
      titulaires: retenus.filter((r) => r.role === 'titulaire').length,
      remplacants: retenus.filter((r) => r.role === 'remplacant').length,
      envoye: false,
      raison: retenus.length ? 'Profils ajoutés « à proposer » : aucun fournisseur d’envoi n’est configuré, envoyez les propositions depuis la mission.' : 'Aucun profil compatible disponible, ou l’équipe est déjà complète.',
    };
  }
  const site = await adressePublique();
  const parId = new Map(classes.map((x) => [x.p.id, x.p]));
  for (const l of retenus) {
    const p = parId.get(l.id)!;
    const texte = `${messageProposition({
      prenom: p.prenoms, titre: m.titre, lieu: m.lieu, zone: m.zone, date_debut: m.date_debut, date_fin: m.date_fin,
      horaires: m.horaires, remuneration: m.remuneration_agent_fcfa, objectifs: m.objectifs, role: l.role,
    })}\nVous pouvez aussi répondre depuis votre espace : ${site}/espace`;
    await envoyerAutomatique({ intervenantId: l.id, missionId, modele: 'proposition', texte });
  }
  return {
    titulaires: retenus.filter((r) => r.role === 'titulaire').length,
    remplacants: retenus.filter((r) => r.role === 'remplacant').length,
    envoye: true,
    raison: retenus.length ? undefined : 'Aucun profil compatible disponible, ou l’équipe est déjà complète.',
  };
}
