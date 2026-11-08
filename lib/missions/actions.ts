'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import { transaction, une } from '@/lib/db';
import { exigerAction, type Contexte } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { recalculerScore } from '@/lib/score/calcul';
import { etatFinancier, genererPaiements, retirerPaiements } from '@/lib/finances/mission';
import {
  equipe,
  lireMission,
  messageProposition,
  refusTransition,
  remplacable,
  type Affectation,
  type StatutMission,
} from './regles';

export type EtatFormulaire = {
  erreurs: Record<string, string>;
  valeurs: Record<string, string | string[]>;
} | null;

function valeurs(f: FormData): Record<string, string | string[]> {
  const v: Record<string, string | string[]> = {};
  for (const k of new Set(f.keys())) {
    if (k.startsWith('$')) continue;
    const tout = f.getAll(k).map(String);
    v[k] = tout.length > 1 ? tout : tout[0];
  }
  return v;
}

const UUID = /^[0-9a-f-]{36}$/i;

function rafraichir(id: string) {
  revalidatePath(`/missions/${id}`);
  revalidatePath('/missions');
}

// ------------------------------------------------------------ fiche mission

/**
 * Cree (id null) ou modifie une mission.
 * A la creation depuis un brief, le brief passe « converti » dans la meme
 * transaction : un brief ne donne qu'une mission.
 */
export async function enregistrerMission(
  id: string | null,
  briefId: string | null,
  _: EtatFormulaire,
  f: FormData,
): Promise<EtatFormulaire> {
  const ctx = await exigerAction('mission:modifier');
  const r = lireMission(f);
  const clientId = String(f.get('client_id') ?? '');
  const responsable = String(f.get('responsable_id') ?? '') || null;
  if (!id && !UUID.test(clientId)) {
    return { erreurs: { ...(r.ok ? {} : r.erreurs), client_id: 'Choisissez le client.' }, valeurs: valeurs(f) };
  }
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = { ...r.donnees, responsable_id: responsable && UUID.test(responsable) ? responsable : null };
  const colonnes = Object.keys(d) as (keyof typeof d)[];

  let cible: string;
  try {
    cible = await transaction(async (c) => {
      if (!id) {
        if (briefId) {
          const { rows } = await c.query('SELECT statut, client_id FROM brief WHERE id = $1 FOR UPDATE', [briefId]);
          if (!rows[0] || rows[0].client_id !== clientId) throw new Error('Brief introuvable pour ce client.');
          if (rows[0].statut !== 'recu') throw new Error('Ce brief a déjà été converti ou abandonné.');
          await c.query(`UPDATE brief SET statut = 'converti', maj_le = now() WHERE id = $1`, [briefId]);
        }
        const { rows } = await c.query<{ id: string; reference: string }>(
          `INSERT INTO mission (client_id, brief_id, statut, ${colonnes.join(', ')})
           VALUES ($1, $2, 'selection', ${colonnes.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id, reference`,
          [clientId, briefId, ...colonnes.map((k) => d[k])],
        );
        await consigner(
          { utilisateurId: ctx.utilisateur.id, action: 'mission_creation', entite: 'mission', entiteId: rows[0].id, details: { reference: rows[0].reference, brief: briefId } },
          c,
        );
        return rows[0].id;
      }

      const { rows } = await c.query('SELECT statut, reference FROM mission WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new Error('Mission introuvable.');
      if (['annulee', 'payee'].includes(rows[0].statut)) throw new Error('Cette mission est close.');
      await c.query(
        `UPDATE mission SET ${colonnes.map((k, i) => `${k} = $${i + 2}`).join(', ')}, maj_le = now() WHERE id = $1`,
        [id, ...colonnes.map((k) => d[k])],
      );
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'mission_modification', entite: 'mission', entiteId: id, details: { reference: rows[0].reference } }, c);
      return id;
    });
  } catch (e) {
    return { erreurs: { general: e instanceof Error ? e.message : 'Erreur inattendue.' }, valeurs: valeurs(f) };
  }

  if (briefId) revalidatePath(`/briefs/${briefId}`);
  rafraichir(cible);
  redirect(`/missions/${cible}`);
}

// ------------------------------------------------------------ statut

async function etatEquipe(c: PoolClient, missionId: string) {
  const { rows } = await c.query<Affectation>(
    'SELECT id, role, reponse, presence, remplace_affectation_id, proposee_le FROM affectation WHERE mission_id = $1',
    [missionId],
  );
  return equipe(rows);
}

export async function changerStatut(id: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('mission:modifier');
  const vers = String(f.get('vers')) as StatutMission;
  const motif = String(f.get('motif') ?? '').trim().slice(0, 500);
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT statut, reference, nb_profils_requis, briefing_le, rapport_transmis_le FROM mission WHERE id = $1 FOR UPDATE', [id]);
      const m = rows[0];
      if (!m) throw new Error('Mission introuvable.');
      const e = await etatEquipe(c, id);
      const { rows: [bilan] } = await c.query(
        `SELECT (SELECT count(*) FROM preuve WHERE mission_id = $1 AND statut = 'validee')::int AS validees,
                (SELECT count(*) FROM preuve WHERE mission_id = $1 AND statut = 'en_attente')::int AS "enAttente",
                (SELECT count(*) FROM preuve WHERE mission_id = $1 AND statut = 'rejetee')::int AS rejetees,
                (SELECT count(*) FROM incident WHERE mission_id = $1 AND resolu_le IS NULL
                    AND gravite IN ('elevee', 'critique'))::int AS "incidentsBloquants"`,
        [id],
      );
      const refus = refusTransition(m.statut, vers, {
        engages: e.engages.length,
        requis: m.nb_profils_requis,
        briefing: !!m.briefing_le,
        presencesManquantes: e.presencesManquantes,
        bilan,
        rapportTransmis: !!m.rapport_transmis_le,
        finances: vers === 'payee' ? await etatFinancier(c, id) : undefined,
      }, motif);
      if (refus) throw new Error(refus);
      // module 5.6 : la validation fait naitre les paiements dus aux intervenants
      if (vers === 'controlee') await genererPaiements(c, id, ctx.utilisateur.id);
      if (m.statut === 'controlee' && vers === 'preuves_collectees') await retirerPaiements(c, id, ctx.utilisateur.id, m.reference);
      await c.query(
        `UPDATE mission SET statut = $2, statut_change_le = now(), maj_le = now(),
                motif_annulation = CASE WHEN $2 = 'annulee' THEN $3 ELSE motif_annulation END
          WHERE id = $1`,
        [id, vers, motif || null],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'mission_statut', entite: 'mission', entiteId: id, details: { reference: m.reference, de: m.statut, vers, motif: motif || undefined } },
        c,
      );
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inattendue.';
  }
  rafraichir(id);
  revalidatePath('/finances', 'layout');
  return null;
}

export async function enregistrerBriefing(id: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('mission:modifier');
  const le = String(f.get('briefing_le') ?? '');
  // saisie « datetime-local » : heure du Benin (UTC+1, sans heure d'ete)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(le)) return 'Indiquez la date et l’heure du briefing.';
  const lieu = String(f.get('briefing_lieu') ?? '').trim().slice(0, 200) || null;
  const notes = String(f.get('briefing_notes') ?? '').trim().slice(0, 2000) || null;
  const m = await une<{ reference: string }>(
    `UPDATE mission SET briefing_le = ($2 || ':00+01:00')::timestamptz, briefing_lieu = $3, briefing_notes = $4, maj_le = now()
      WHERE id = $1 AND statut NOT IN ('annulee', 'payee') RETURNING reference`,
    [id, le, lieu, notes],
  );
  if (!m) return 'Mission introuvable ou close.';
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'mission_briefing', entite: 'mission', entiteId: id, details: { reference: m.reference, le, lieu } });
  rafraichir(id);
  return null;
}

// ------------------------------------------------------------ equipe

/** Ajoute des profils a la mission, comme titulaires ou remplacants. Les doublons sont ignores. */
export async function ajouterProfils(id: string, f: FormData) {
  const ctx = await exigerAction('mission:modifier');
  const role = f.get('role') === 'remplacant' ? 'remplacant' : 'titulaire';
  const ids = f.getAll('intervenant_id').map(String).filter((x) => UUID.test(x)).slice(0, 100);
  if (!ids.length) return;
  await transaction(async (c) => {
    const { rows } = await c.query('SELECT statut, reference FROM mission WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0] || !['selection', 'preparation', 'execution'].includes(rows[0].statut)) {
      throw new Error('On ne compose l’équipe qu’entre la sélection et l’exécution.');
    }
    // seuls les profils verifies ou actifs peuvent etre mobilises
    const { rows: ajoutes } = await c.query<{ intervenant_id: string }>(
      `INSERT INTO affectation (mission_id, intervenant_id, role)
       SELECT $1, i.id, $3 FROM intervenant i WHERE i.id = ANY ($2::uuid[]) AND i.statut IN ('verifie', 'actif')
       ON CONFLICT (mission_id, intervenant_id) DO NOTHING
       RETURNING intervenant_id`,
      [id, ids, role],
    );
    if (ajoutes.length) {
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'affectation_ajout', entite: 'mission', entiteId: id, details: { reference: rows[0].reference, role, nombre: ajoutes.length } },
        c,
      );
    }
  });
  rafraichir(id);
  redirect(`/missions/${id}`);
}

/**
 * Operations sur une ligne d'equipe : proposer, enregistrer la reponse,
 * retirer, noter la presence, remplacer un absent.
 */
export async function operer(missionId: string, affectationId: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('mission:modifier');
  const op = String(f.get('op'));
  try {
    await transaction((c) => operation(c, ctx, missionId, affectationId, op, f));
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inattendue.';
  }
  rafraichir(missionId);
  return null;
}

async function operation(c: PoolClient, ctx: Contexte, missionId: string, affectationId: string, op: string, f: FormData) {
  const { rows } = await c.query(
    `SELECT a.*, m.statut AS mission_statut, m.reference, m.titre, m.lieu, m.zone, m.date_debut, m.date_fin,
            m.horaires, m.objectifs, m.remuneration_agent_fcfa, i.prenoms, i.nom, i.reference AS ref_intervenant
       FROM affectation a JOIN mission m ON m.id = a.mission_id JOIN intervenant i ON i.id = a.intervenant_id
      WHERE a.id = $1 AND a.mission_id = $2 FOR UPDATE OF a, m`,
    [affectationId, missionId],
  );
  const a = rows[0];
  if (!a) throw new Error('Ligne introuvable.');
  if (['annulee', 'payee'].includes(a.mission_statut)) throw new Error('Cette mission est close.');

  const trace = (action: string, details: object) =>
    consigner(
      { utilisateurId: ctx.utilisateur.id, action, entite: 'mission', entiteId: missionId, details: { reference: a.reference, intervenant: `${a.nom} ${a.prenoms}`, ...details } },
      c,
    );

  switch (op) {
    case 'proposer': {
      const canal = String(f.get('canal'));
      if (!['sms', 'whatsapp', 'appel'].includes(canal)) throw new Error('Canal inconnu.');
      if (a.remuneration_agent_fcfa === null) throw new Error('Fixez la rémunération par intervenant avant de proposer la mission.');
      if (a.reponse !== 'en_attente') throw new Error('Cette personne a déjà répondu.');
      await c.query(
        `UPDATE affectation SET proposee_le = now(), canal_proposition = $2, remuneration_proposee_fcfa = $3 WHERE id = $1`,
        [affectationId, canal, a.remuneration_agent_fcfa],
      );
      // historique des communications (5.8) : le texte exact des conditions annoncees
      await c.query(
        `INSERT INTO communication (intervenant_id, mission_id, canal, objet, contenu, auteur_id) VALUES ($1, $2, $3, 'Proposition de mission', $4, $5)`,
        [a.intervenant_id, missionId, canal, messageProposition({
          prenom: a.prenoms, titre: a.titre, lieu: a.lieu, zone: a.zone, date_debut: a.date_debut, date_fin: a.date_fin,
          horaires: a.horaires, remuneration: a.remuneration_agent_fcfa, objectifs: a.objectifs, role: a.role,
        }), ctx.utilisateur.id],
      );
      return trace('affectation_proposition', { canal });
    }
    case 'accepter':
    case 'refuser': {
      if (!a.proposee_le) throw new Error('Envoyez d’abord la proposition.');
      const motif = op === 'refuser' ? String(f.get('motif') ?? '').trim().slice(0, 300) || null : null;
      await c.query(
        `UPDATE affectation SET reponse = $2, reponse_le = now(), motif_refus = $3 WHERE id = $1`,
        [affectationId, op === 'accepter' ? 'accepte' : 'refuse', motif],
      );
      return trace('affectation_reponse', { reponse: op === 'accepter' ? 'accepte' : 'refuse', motif: motif ?? undefined });
    }
    case 'retirer': {
      if (a.presence) throw new Error('La présence est déjà notée : la ligne fait partie de l’historique.');
      const { rowCount } = await c.query('SELECT 1 FROM affectation WHERE remplace_affectation_id = $1', [affectationId]);
      if (rowCount) throw new Error('Cette personne a été remplacée : la ligne fait partie de l’historique.');
      await c.query('DELETE FROM affectation WHERE id = $1', [affectationId]);
      return trace('affectation_retrait', { role: a.role });
    }
    case 'presence': {
      const valeur = String(f.get('valeur'));
      if (!['present', 'retard', 'absent'].includes(valeur)) throw new Error('Valeur inconnue.');
      if (!['execution', 'preuves_collectees'].includes(a.mission_statut)) throw new Error('La présence se note pendant l’exécution.');
      if (a.role !== 'titulaire' || a.reponse !== 'accepte') throw new Error('Seuls les intervenants engagés sont pointés.');
      await c.query('UPDATE affectation SET presence = $2, presence_notee_le = now() WHERE id = $1', [affectationId, valeur]);
      await recalculerScore(c, a.intervenant_id, `Présence pointée sur la mission ${a.reference}`, { utilisateurId: ctx.utilisateur.id });
      return trace('affectation_presence', { presence: valeur });
    }
    case 'remplacer': {
      const parId = String(f.get('remplacant_id') ?? '');
      const { rows: tous } = await c.query<Affectation>(
        'SELECT id, role, reponse, presence, remplace_affectation_id FROM affectation WHERE mission_id = $1',
        [missionId],
      );
      const e = equipe(tous);
      if (!remplacable(a, e.remplaces)) throw new Error('Seul un titulaire absent ou qui a refusé peut être remplacé.');
      const r = e.reserve.find((x) => x.id === parId);
      if (!r) throw new Error('Choisissez un remplaçant disponible dans la réserve.');
      await c.query(`UPDATE affectation SET role = 'titulaire', remplace_affectation_id = $2 WHERE id = $1`, [parId, affectationId]);
      return trace('affectation_remplacement', { remplacant: parId });
    }
    default:
      throw new Error('Opération inconnue.');
  }
}
