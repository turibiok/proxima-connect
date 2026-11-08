'use server';

import { revalidatePath } from 'next/cache';
import { une } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import { STATUTS_TERRITOIRE, type StatutTerritoire } from './regles';

/** Statut et objectif d'un territoire (administrateur). */
export async function reglerTerritoire(departement: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('parametre:gerer');
  const statut = String(f.get('statut')) as StatutTerritoire;
  if (!(statut in STATUTS_TERRITOIRE)) return 'Statut inconnu.';
  const saisie = String(f.get('objectif_profils') ?? '').trim();
  const objectif = saisie ? Number(saisie) : null;
  if (objectif !== null && (!Number.isInteger(objectif) || objectif < 0 || objectif > 100_000)) return 'Objectif : un nombre entier de profils.';
  const note = String(f.get('note') ?? '').trim().slice(0, 300) || null;
  const t = await une<{ departement: string }>(
    `UPDATE territoire SET statut = $2, objectif_profils = $3, note = $4, maj_le = now(), maj_par = $5 WHERE departement = $1 RETURNING departement`,
    [departement, statut, objectif, note, ctx.utilisateur.id],
  );
  if (!t) return 'Département inconnu.';
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'territoire_reglage', entite: 'parametre', details: { departement, statut, objectif } });
  revalidatePath('/reporting/territoires');
  return null;
}
