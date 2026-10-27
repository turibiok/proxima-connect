'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction, une } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { lireBrief, lireClient, STATUTS_COMMERCIAUX, type StatutCommercial } from './regles';

export type EtatFormulaire = {
  erreurs: Record<string, string>;
  valeurs: Record<string, string | string[]>;
} | null;

function valeurs(f: FormData): Record<string, string | string[]> {
  const v: Record<string, string | string[]> = {};
  for (const k of new Set(f.keys())) {
    if (k.startsWith('$')) continue; // champs internes de Next
    const tout = f.getAll(k).map(String);
    v[k] = tout.length > 1 ? tout : tout[0];
  }
  return v;
}

/** Liste des champs modifies, pour le journal : on trace quoi, pas les valeurs. */
function champsModifies<T extends object>(avant: Record<string, unknown>, apres: T): string[] {
  return (Object.keys(apres) as (keyof T & string)[]).filter(
    (k) => JSON.stringify(avant[k] ?? null) !== JSON.stringify(apres[k] ?? null),
  );
}

// ------------------------------------------------------------ clients

/** Cree (id null) ou modifie une fiche client. */
export async function enregistrerClient(id: string | null, _: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const ctx = await exigerAction('client:modifier');
  const r = lireClient(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = r.donnees;

  // Doublons : meme IFU, ou meme raison sociale a la casse pres.
  const doublon = await une<{ id: string; raison_sociale: string }>(
    `SELECT id, raison_sociale FROM client
      WHERE (($1::text IS NOT NULL AND ifu = $1) OR lower(trim(raison_sociale)) = lower($2))
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1`,
    [d.ifu, d.raison_sociale, id],
  );
  if (doublon) {
    return {
      erreurs: { [d.ifu && doublon.raison_sociale.toLowerCase() !== d.raison_sociale.toLowerCase() ? 'ifu' : 'raison_sociale']: `Cette entreprise existe déjà : ${doublon.raison_sociale}.` },
      valeurs: valeurs(f),
    };
  }

  const colonnes = Object.keys(d) as (keyof typeof d)[];
  const cible = await transaction(async (c) => {
    if (!id) {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO client (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        colonnes.map((k) => d[k]),
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'client_creation', entite: 'client', entiteId: rows[0].id, details: { raison_sociale: d.raison_sociale } },
        c,
      );
      return rows[0].id;
    }

    const { rows } = await c.query('SELECT * FROM client WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new Error('Client introuvable.');
    const modifies = champsModifies(rows[0], d);
    if (modifies.length === 0) return id;
    await c.query(
      `UPDATE client SET ${colonnes.map((k, i) => `${k} = $${i + 2}`).join(', ')}, maj_le = now()
         ${modifies.includes('statut_commercial') ? ', statut_change_le = now()' : ''}
       WHERE id = $1`,
      [id, ...colonnes.map((k) => d[k])],
    );
    await consigner(
      {
        utilisateurId: ctx.utilisateur.id,
        action: modifies.includes('statut_commercial') ? 'client_statut' : 'client_modification',
        entite: 'client',
        entiteId: id,
        details: { raison_sociale: d.raison_sociale, champs: modifies, ...(modifies.includes('statut_commercial') && { de: rows[0].statut_commercial, vers: d.statut_commercial }) },
      },
      c,
    );
    return id;
  });

  revalidatePath('/clients');
  redirect(`/clients/${cible}`);
}

export async function changerStatutCommercial(id: string, statut: StatutCommercial) {
  const ctx = await exigerAction('client:modifier');
  if (!(statut in STATUTS_COMMERCIAUX)) throw new Error('Statut inconnu.');
  await transaction(async (c) => {
    const { rows } = await c.query('SELECT statut_commercial, raison_sociale FROM client WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new Error('Client introuvable.');
    if (rows[0].statut_commercial === statut) return;
    await c.query('UPDATE client SET statut_commercial = $2, statut_change_le = now(), maj_le = now() WHERE id = $1', [id, statut]);
    await consigner(
      { utilisateurId: ctx.utilisateur.id, action: 'client_statut', entite: 'client', entiteId: id, details: { raison_sociale: rows[0].raison_sociale, de: rows[0].statut_commercial, vers: statut } },
      c,
    );
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath('/clients');
}

// ------------------------------------------------------------ briefs

/** Cree (briefId null) ou modifie un brief. Un brief converti ou abandonne n'est plus modifiable. */
export async function enregistrerBrief(
  clientId: string,
  briefId: string | null,
  _: EtatFormulaire,
  f: FormData,
): Promise<EtatFormulaire> {
  const ctx = await exigerAction('client:modifier');
  const r = lireBrief(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = r.donnees;
  const colonnes = Object.keys(d) as (keyof typeof d)[];

  const cible = await transaction(async (c) => {
    if (!briefId) {
      const client = await c.query('SELECT raison_sociale FROM client WHERE id = $1', [clientId]);
      if (!client.rows[0]) throw new Error('Client introuvable.');
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO brief (client_id, saisi_par, ${colonnes.join(', ')})
         VALUES ($1, $2, ${colonnes.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
        [clientId, ctx.utilisateur.id, ...colonnes.map((k) => d[k])],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'brief_creation', entite: 'brief', entiteId: rows[0].id, details: { client: client.rows[0].raison_sociale } },
        c,
      );
      return rows[0].id;
    }

    const { rows } = await c.query('SELECT * FROM brief WHERE id = $1 AND client_id = $2 FOR UPDATE', [briefId, clientId]);
    if (!rows[0]) throw new Error('Brief introuvable.');
    if (rows[0].statut !== 'recu') throw new Error('Ce brief est clos : il ne peut plus être modifié.');
    const modifies = champsModifies(rows[0], d);
    if (modifies.length) {
      await c.query(
        `UPDATE brief SET ${colonnes.map((k, i) => `${k} = $${i + 2}`).join(', ')}, maj_le = now() WHERE id = $1`,
        [briefId, ...colonnes.map((k) => d[k])],
      );
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'brief_modification', entite: 'brief', entiteId: briefId, details: { champs: modifies } }, c);
    }
    return briefId;
  });

  revalidatePath('/briefs');
  revalidatePath(`/clients/${clientId}`);
  redirect(`/briefs/${cible}`);
}

export async function abandonnerBrief(id: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('client:modifier');
  const motif = String(f.get('motif') ?? '').trim().slice(0, 500);
  if (!motif) return 'Indiquez pourquoi ce brief est abandonné.';
  const r = await une<{ client_id: string }>(
    `UPDATE brief SET statut = 'abandonne', motif_abandon = $2, maj_le = now()
      WHERE id = $1 AND statut = 'recu' RETURNING client_id`,
    [id, motif],
  );
  if (!r) return 'Ce brief n’est plus à traiter.';
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'brief_statut', entite: 'brief', entiteId: id, details: { vers: 'abandonne', motif } });
  revalidatePath(`/briefs/${id}`);
  revalidatePath('/briefs');
  revalidatePath(`/clients/${r.client_id}`);
  return null;
}

export async function rouvrirBrief(id: string) {
  const ctx = await exigerAction('client:modifier');
  const r = await une<{ client_id: string }>(
    `UPDATE brief SET statut = 'recu', motif_abandon = NULL, maj_le = now()
      WHERE id = $1 AND statut = 'abandonne' RETURNING client_id`,
    [id],
  );
  if (!r) throw new Error('Seul un brief abandonné peut être rouvert.');
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'brief_statut', entite: 'brief', entiteId: id, details: { vers: 'recu' } });
  revalidatePath(`/briefs/${id}`);
  revalidatePath('/briefs');
  revalidatePath(`/clients/${r.client_id}`);
}
