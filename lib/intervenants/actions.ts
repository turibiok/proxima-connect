'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction, une } from '@/lib/db';
import { contexte, exigerAction, origine } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import type { StatutProfil } from '@/lib/referentiel';
import { lireInscription, refusTransition, VERSION_CONSENTEMENT } from './regles';

export type EtatFormulaire = {
  erreurs: Record<string, string>;
  valeurs: Record<string, string | string[]>;
} | null;

/** Recopie la saisie pour la reafficher si le formulaire est refuse. */
function valeurs(f: FormData): Record<string, string | string[]> {
  const v: Record<string, string | string[]> = {};
  for (const k of new Set(f.keys())) {
    const tout = f.getAll(k).map(String);
    v[k] = tout.length > 1 ? tout : tout[0];
  }
  return v;
}

/**
 * Enregistre un profil.
 *   - `public`  : formulaire d'inscription, sans compte ;
 *   - `interne` : saisie par l'equipe (inscription sur le terrain, au telephone).
 */
export async function enregistrerIntervenant(
  mode: 'public' | 'interne',
  _: EtatFormulaire,
  f: FormData,
): Promise<EtatFormulaire> {
  const ctx = mode === 'interne' ? await exigerAction('profil:modifier') : await contexte();

  // Champ invisible pour un humain : un robot qui le remplit recoit la meme
  // page de remerciement qu'une vraie inscription, sans que rien ne soit enregistre.
  if (mode === 'public' && String(f.get('site_web') ?? '')) redirect('/inscription/merci');

  const r = lireInscription(f, new Date());
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = r.donnees;

  const deja = await une<{ reference: string }>('SELECT reference FROM intervenant WHERE telephone = $1', [d.telephone]);
  if (deja) {
    return {
      erreurs: {
        telephone:
          mode === 'public'
            ? 'Ce numéro est déjà inscrit. Contactez PROXIMA CONNECT pour mettre votre profil à jour.'
            : `Ce numéro est déjà inscrit (profil ${deja.reference}).`,
      },
      valeurs: valeurs(f),
    };
  }

  const { ip } = await origine();
  const cree = await transaction(async (c) => {
    const { rows } = await c.query<{ id: string; reference: string }>(
      `INSERT INTO intervenant (
         nom, prenoms, sexe, date_naissance, telephone, whatsapp, email,
         ville, quartier, zones, deplacements,
         niveau_etudes, formation, situation, experiences, competences, langues,
         jours_disponibles, creneaux, categories_missions,
         piece_type, piece_numero, paiement_mode, paiement_operateur, paiement_compte,
         consentement_le, consentement_version, consentement_ip, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
               now(), $26, $27, $28)
       RETURNING id, reference`,
      [
        d.nom, d.prenoms, d.sexe, d.date_naissance, d.telephone, d.whatsapp, d.email,
        d.ville, d.quartier, d.zones, d.deplacements,
        d.niveau_etudes, d.formation, d.situation, d.experiences, d.competences, d.langues,
        d.jours_disponibles, d.creneaux, d.categories_missions,
        d.piece_type, d.piece_numero, d.paiement_mode, d.paiement_operateur, d.paiement_compte,
        VERSION_CONSENTEMENT, ip, mode === 'public' ? 'formulaire' : 'saisie_interne',
      ],
    );
    await consigner(
      {
        utilisateurId: mode === 'interne' ? (ctx?.utilisateur.id ?? null) : null,
        action: mode === 'public' ? 'inscription' : 'creation_interne',
        entite: 'intervenant',
        entiteId: rows[0].id,
        details: { reference: rows[0].reference },
      },
      c,
    );
    return rows[0];
  });

  revalidatePath('/intervenants');
  if (mode === 'public') redirect(`/inscription/merci?ref=${cree.reference}`);
  redirect(`/intervenants/${cree.id}`);
}

// ------------------------------------------------------------ verification

const COLONNES_CONTROLE = {
  identite: ['identite_verifiee_le', 'identite_verifiee_par'],
  telephone: ['telephone_verifie_le', 'telephone_verifie_par'],
  paiement: ['paiement_verifie_le', 'paiement_verifie_par'],
} as const;

/** Coche ou decoche un des controles manuels. */
export async function basculerControle(id: string, code: keyof typeof COLONNES_CONTROLE, valide: boolean) {
  const ctx = await exigerAction('profil:verifier');
  const colonnes = COLONNES_CONTROLE[code];
  if (!colonnes) throw new Error('Contrôle inconnu.');
  const [le, par] = colonnes;

  await transaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE intervenant SET ${le} = ${valide ? 'now()' : 'NULL'}, ${par} = $2, maj_le = now() WHERE id = $1`,
      [id, valide ? ctx.utilisateur.id : null],
    );
    if (!rowCount) throw new Error('Profil introuvable.');
    // Retirer un controle a un profil verifie ou actif le renvoie en
    // attente : le statut ne doit jamais affirmer une verification absente.
    if (!valide) {
      await c.query(
        `UPDATE intervenant SET statut = 'en_attente', statut_motif = 'Contrôle retiré : ' || $2,
                statut_change_le = now()
          WHERE id = $1 AND statut IN ('verifie', 'actif')`,
        [id, code],
      );
    }
    await consigner(
      { utilisateurId: ctx.utilisateur.id, action: 'controle', entite: 'intervenant', entiteId: id, details: { controle: code, valide } },
      c,
    );
  });
  revalidatePath(`/intervenants/${id}`);
}

export async function changerStatut(id: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('profil:verifier');
  const vers = String(f.get('statut')) as StatutProfil;
  const motif = String(f.get('motif') ?? '').trim().slice(0, 500);

  try {
    await transaction(async (c) => {
      // FOR UPDATE : deux changements simultanes ne peuvent pas partir du meme etat.
      const { rows } = await c.query(
        `SELECT statut, date_naissance, identite_verifiee_le, telephone_verifie_le, paiement_verifie_le,
                paiement_mode, paiement_compte
           FROM intervenant WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const p = rows[0];
      if (!p) throw new Error('Profil introuvable.');
      const refus = refusTransition(p.statut, vers, p, motif, new Date());
      if (refus) throw new Error(refus);
      await c.query(
        `UPDATE intervenant SET statut = $2, statut_motif = $3, statut_change_le = now(), maj_le = now() WHERE id = $1`,
        [id, vers, motif || null],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'statut', entite: 'intervenant', entiteId: id, details: { de: p.statut, vers, motif: motif || undefined } },
        c,
      );
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inattendue.';
  }
  revalidatePath(`/intervenants/${id}`);
  revalidatePath('/intervenants');
  return null;
}
