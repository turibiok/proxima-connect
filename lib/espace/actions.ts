'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction, une } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { accesAutorise, ECHECS_MAX, etatLien, lireDateNaissance, messageAcces, MESSAGES_LIEN } from './regles';
import { creerLien, fermerSessionIntervenant, intervenantCourant, lireLien, ouvrirSessionIntervenant } from './session';
import { enregistrerReponse } from '@/lib/automatisation/reponses';

const UUID = /^[0-9a-f-]{36}$/i;

export type EtatLienPrepare = { lien?: string; message?: string; erreur?: string } | null;

// ------------------------------------------------------------ cote equipe

/** Prepare un lien d'acces a envoyer a l'intervenant (il remplace les precedents). */
export async function preparerLien(intervenantId: string, _: EtatLienPrepare): Promise<EtatLienPrepare> {
  const ctx = await exigerAction('profil:lire');
  if (!ctx.peut('profil:modifier') && !ctx.peut('mission:modifier')) return { erreur: 'Vous n’avez pas le droit de faire cette action.' };
  if (!UUID.test(intervenantId)) return { erreur: 'Intervenant introuvable.' };
  try {
    const r = await transaction(async (c) => {
      const { rows } = await c.query('SELECT prenoms, statut FROM intervenant WHERE id = $1', [intervenantId]);
      if (!rows[0]) throw new Error('Intervenant introuvable.');
      if (!accesAutorise(rows[0].statut)) throw new Error('Un profil inactif n’a pas accès à l’espace intervenant.');
      const lien = await creerLien(c, intervenantId, ctx.utilisateur.id);
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'espace_lien', entite: 'intervenant', entiteId: intervenantId }, c);
      return { lien, message: messageAcces(rows[0].prenoms, lien) };
    });
    revalidatePath(`/intervenants/${intervenantId}`);
    return r;
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inattendue.' };
  }
}

/** Ferme tous les acces : liens en attente revoques, telephones deconnectes. */
export async function fermerAcces(intervenantId: string): Promise<void> {
  const ctx = await exigerAction('profil:lire');
  if (!ctx.peut('profil:modifier') && !ctx.peut('mission:modifier')) throw new Error('Vous n’avez pas le droit de faire cette action.');
  if (!UUID.test(intervenantId)) return;
  await transaction(async (c) => {
    await c.query('UPDATE acces_intervenant SET revoque_le = now() WHERE intervenant_id = $1 AND utilise_le IS NULL AND revoque_le IS NULL', [intervenantId]);
    const { rowCount } = await c.query('DELETE FROM session_intervenant WHERE intervenant_id = $1', [intervenantId]);
    await consigner({ utilisateurId: ctx.utilisateur.id, action: 'espace_fermeture', entite: 'intervenant', entiteId: intervenantId, details: { sessions: rowCount } }, c);
  });
  revalidatePath(`/intervenants/${intervenantId}`);
}

// ------------------------------------------------------------ cote intervenant

/**
 * Ouverture de l'espace depuis le lien recu : la date de naissance confirme
 * que c'est bien la personne. Un lien transfere ne suffit donc pas, et les
 * essais sont limites.
 */
export async function ouvrirEspace(jeton: string, _: string | null, f: FormData): Promise<string | null> {
  const saisie = lireDateNaissance(String(f.get('date_naissance') ?? ''));
  if (!saisie) return 'Indiquez votre date de naissance (jour, mois, année).';

  const issue = await transaction(async (c) => {
    const l = await lireLien(c, jeton);
    if (!l) return { erreur: 'Ce lien n’est pas valable. Demandez-en un nouveau à l’équipe PROXIMA.' };
    const etat = etatLien(l);
    if (etat !== 'valide') return { erreur: `${MESSAGES_LIEN[etat]} Demandez un nouveau lien à l’équipe PROXIMA.` };
    if (!accesAutorise(l.statut)) return { erreur: 'Votre profil n’a plus accès à l’espace. Contactez l’équipe PROXIMA.' };

    if (l.date_naissance !== saisie) {
      const echecs = l.echecs + 1;
      await c.query('UPDATE acces_intervenant SET echecs = $2 WHERE id = $1', [l.id, echecs]);
      await consigner({ utilisateurId: null, action: 'espace_echec', entite: 'intervenant', entiteId: l.intervenant_id, details: { echecs } }, c);
      const restants = ECHECS_MAX - echecs;
      return {
        erreur: restants > 0
          ? `La date de naissance ne correspond pas. Encore ${restants} essai${restants > 1 ? 's' : ''}.`
          : 'La date de naissance ne correspond pas. Ce lien est désormais bloqué : demandez-en un nouveau à l’équipe PROXIMA.',
      };
    }

    await c.query('UPDATE acces_intervenant SET utilise_le = now() WHERE id = $1', [l.id]);
    await ouvrirSessionIntervenant(c, l.intervenant_id);
    await consigner({ utilisateurId: null, action: 'espace_connexion', entite: 'intervenant', entiteId: l.intervenant_id }, c);
    return { erreur: null };
  });
  if (issue.erreur) return issue.erreur;
  redirect('/espace');
}

/** Reponse de l'intervenant a une proposition, depuis son espace (phase 3). */
export async function repondreProposition(affectationId: string, reponse: 'accepte' | 'refuse', _: string | null): Promise<string | null> {
  const i = await intervenantCourant();
  if (!i) return 'Votre session a expiré : rouvrez votre espace avec un nouveau lien.';
  if (!UUID.test(affectationId) || (reponse !== 'accepte' && reponse !== 'refuse')) return 'Proposition introuvable.';
  // une personne ne repond qu'a ses propres propositions
  const a = await une('SELECT 1 FROM affectation WHERE id = $1 AND intervenant_id = $2', [affectationId, i.id]);
  if (!a) return 'Proposition introuvable.';
  const r = await enregistrerReponse(affectationId, reponse, 'espace', reponse === 'refuse' ? 'Refus depuis l’espace intervenant' : null);
  if (!r.ok) return r.erreur;
  revalidatePath('/espace');
  revalidatePath(`/missions/${r.missionId}`);
  return null;
}

export async function quitterEspace() {
  await fermerSessionIntervenant();
  redirect('/espace/connexion');
}

/** Nombre de telephones connectes et dernier lien, pour la fiche intervenant. */
export async function etatEspace(intervenantId: string) {
  await exigerAction('profil:lire');
  return une<{ sessions: number; derniere_visite: Date | null; dernier_lien: Date | null; lien_utilise: Date | null; lien_expire: Date | null; lien_revoque: Date | null; echecs: number | null }>(
    `SELECT (SELECT count(*) FROM session_intervenant s WHERE s.intervenant_id = $1 AND s.expire_le > now())::int AS sessions,
            (SELECT max(derniere_visite) FROM session_intervenant s WHERE s.intervenant_id = $1) AS derniere_visite,
            a.cree_le AS dernier_lien, a.utilise_le AS lien_utilise, a.expire_le AS lien_expire, a.revoque_le AS lien_revoque, a.echecs
       FROM (SELECT 1) x
       LEFT JOIN LATERAL (SELECT * FROM acces_intervenant WHERE intervenant_id = $1 ORDER BY cree_le DESC LIMIT 1) a ON true`,
    [intervenantId],
  );
}
