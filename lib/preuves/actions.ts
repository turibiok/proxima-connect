'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import { transaction } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import {
  estImage,
  FICHIERS_MAX,
  GRAVITES,
  lignesCsv,
  lirePreuve,
  nomPropre,
  RESULTATS_CONTROLE,
  TAILLE_MAX,
  typeReel,
  TYPES_CONTROLE,
} from './regles';

export type EtatSaisie = { erreurs?: Record<string, string>; valeurs?: Record<string, string>; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/** Statuts de mission ou l'on saisit et controle les preuves. */
const STATUTS_PREUVES = ['execution', 'preuves_collectees'];

function valeurs(f: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, x] of f.entries()) if (typeof x === 'string' && !k.startsWith('$') && k !== 'signature_png') v[k] = x;
  return v;
}

/** Verrouille la mission et verifie qu'elle est dans un etat qui permet l'operation. */
async function mission(c: PoolClient, id: string, statuts: string[], quoi: string) {
  const { rows } = await c.query('SELECT reference, statut FROM mission WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new Error('Mission introuvable.');
  if (!statuts.includes(rows[0].statut)) throw new Error(`${quoi} n’est pas possible à cette étape de la mission.`);
  return rows[0] as { reference: string; statut: string };
}

async function membreEquipe(c: PoolClient, missionId: string, intervenantId: string | null) {
  if (!intervenantId) return;
  const { rowCount } = await c.query('SELECT 1 FROM affectation WHERE mission_id = $1 AND intervenant_id = $2', [missionId, intervenantId]);
  if (!rowCount) throw new Error('Cet intervenant ne fait pas partie de l’équipe de la mission.');
}

function rafraichir(id: string) {
  revalidatePath(`/missions/${id}/preuves`);
  revalidatePath(`/missions/${id}`);
}

// ------------------------------------------------------------ preuves

interface Piece {
  nom: string;
  mime: string;
  octets: Buffer;
}

/** Fichiers envoyes + signature dessinee, verifies un par un. */
async function piecesJointes(f: FormData, type: string): Promise<{ pieces: Piece[]; erreur?: string }> {
  const pieces: Piece[] = [];
  const fichiers = f.getAll('fichiers').filter((x): x is File => typeof x !== 'string' && x.size > 0);
  if (fichiers.length > FICHIERS_MAX) return { pieces, erreur: `${FICHIERS_MAX} fichiers au plus par preuve.` };

  for (const fichier of fichiers) {
    if (fichier.size > TAILLE_MAX) return { pieces, erreur: `« ${nomPropre(fichier.name)} » dépasse 8 Mo.` };
    const octets = Buffer.from(await fichier.arrayBuffer());
    const mime = typeReel(octets, fichier.name);
    if (!mime) return { pieces, erreur: `« ${nomPropre(fichier.name)} » : format non accepté (photos JPEG, PNG, WebP ; PDF, CSV, Excel).` };
    if (type === 'photo' && !estImage(mime)) return { pieces, erreur: `« ${nomPropre(fichier.name)} » n’est pas une photo.` };
    pieces.push({ nom: nomPropre(fichier.name), mime, octets });
  }

  // signature dessinee a l'ecran : image PNG transmise en data URL
  const dessin = String(f.get('signature_png') ?? '');
  if (type === 'signature' && dessin.startsWith('data:image/png;base64,')) {
    const octets = Buffer.from(dessin.slice('data:image/png;base64,'.length), 'base64');
    if (octets.length > TAILLE_MAX || typeReel(octets, 'signature.png') !== 'image/png') return { pieces, erreur: 'Signature illisible.' };
    pieces.push({ nom: 'signature.png', mime: 'image/png', octets });
  }
  return { pieces };
}

export async function ajouterPreuve(missionId: string, _: EtatSaisie, f: FormData): Promise<EtatSaisie> {
  const ctx = await exigerAction('mission:modifier');
  const type = String(f.get('type') ?? '');
  const { pieces, erreur } = await piecesJointes(f, type);
  if (erreur) return { erreurs: { fichiers: erreur }, valeurs: valeurs(f) };

  const r = lirePreuve(f, pieces.length);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = r.donnees;

  // nombre de lignes des CSV importes : ordre de grandeur du travail rendu
  const csv = pieces.filter((p) => p.mime === 'text/csv');
  if (csv.length) d.donnees = { ...d.donnees, lignes: csv.reduce((n, p) => n + lignesCsv(p.octets.toString('utf8')), 0) };

  try {
    await transaction(async (c) => {
      const m = await mission(c, missionId, STATUTS_PREUVES, 'La saisie de preuves');
      await membreEquipe(c, missionId, d.intervenant_id);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO preuve (mission_id, intervenant_id, type, description, realisee_le, latitude, longitude, precision_m,
                             consentement_photo, donnees, saisie_par)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE ($5 || ':00+01:00')::timestamptz END,
                 $6, $7, $8, $9, $10, $11) RETURNING id`,
        [missionId, d.intervenant_id, d.type, d.description, d.realisee_le, d.latitude, d.longitude, d.precision_m,
         d.consentement_photo, d.donnees ? JSON.stringify(d.donnees) : null, ctx.utilisateur.id],
      );
      for (const p of pieces) {
        await c.query(
          'INSERT INTO fichier (preuve_id, nom, type_mime, taille, sha256, contenu) VALUES ($1, $2, $3, $4, $5, $6)',
          [rows[0].id, p.nom, p.mime, p.octets.length, createHash('sha256').update(p.octets).digest('hex'), p.octets],
        );
      }
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'preuve_ajout', entite: 'mission', entiteId: missionId, details: { reference: m.reference, type: d.type, fichiers: pieces.length } },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: e instanceof Error ? e.message : 'Erreur inattendue.' }, valeurs: valeurs(f) };
  }
  rafraichir(missionId);
  return { ok: `Preuve enregistrée${pieces.length ? ` avec ${pieces.length} fichier${pieces.length > 1 ? 's' : ''}` : ''}.` };
}

/** Valider, rejeter (motif obligatoire) ou remettre a controler une preuve. */
export async function statuerPreuve(missionId: string, preuveId: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('mission:modifier');
  const op = String(f.get('op'));
  const motif = String(f.get('motif') ?? '').trim().slice(0, 500);
  if (op === 'rejeter' && !motif) return 'Indiquez le motif du rejet : il sera communiqué à l’intervenant.';
  const statut = { valider: 'validee', rejeter: 'rejetee', reouvrir: 'en_attente' }[op];
  if (!statut) return 'Opération inconnue.';
  try {
    await transaction(async (c) => {
      const m = await mission(c, missionId, STATUTS_PREUVES, 'Le contrôle des preuves');
      const { rows } = await c.query(
        `UPDATE preuve SET statut = $3, motif_rejet = $4,
                validee_par = CASE WHEN $3 = 'en_attente' THEN NULL ELSE $5::uuid END,
                validee_le = CASE WHEN $3 = 'en_attente' THEN NULL ELSE now() END
          WHERE id = $1 AND mission_id = $2 RETURNING type`,
        [preuveId, missionId, statut, statut === 'rejetee' ? motif : null, ctx.utilisateur.id],
      );
      if (!rows[0]) throw new Error('Preuve introuvable.');
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'preuve_statut', entite: 'mission', entiteId: missionId, details: { reference: m.reference, preuve: preuveId, statut, motif: motif || undefined } },
        c,
      );
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inattendue.';
  }
  rafraichir(missionId);
  return null;
}

// ------------------------------------------------------------ controles et incidents

const OUVERTE = ['preparation', 'execution', 'preuves_collectees', 'controlee'];

export async function ajouterControle(missionId: string, _: EtatSaisie, f: FormData): Promise<EtatSaisie> {
  const ctx = await exigerAction('mission:modifier');
  const type = String(f.get('type') ?? '');
  const resultat = String(f.get('resultat') ?? '');
  const commentaire = String(f.get('commentaire') ?? '').trim().slice(0, 2000) || null;
  const intervenant = String(f.get('intervenant_id') ?? '');
  const erreurs: Record<string, string> = {};
  if (!TYPES_CONTROLE.includes(type)) erreurs.type = 'Choisissez le type de contrôle.';
  if (!(resultat in RESULTATS_CONTROLE)) erreurs.resultat = 'Indiquez le résultat.';
  if (resultat !== 'conforme' && !commentaire) erreurs.commentaire = 'Décrivez ce qui ne va pas.';
  if (Object.keys(erreurs).length) return { erreurs, valeurs: valeurs(f) };
  try {
    await transaction(async (c) => {
      const m = await mission(c, missionId, OUVERTE, 'Un contrôle');
      const id = UUID.test(intervenant) ? intervenant : null;
      await membreEquipe(c, missionId, id);
      await c.query(
        'INSERT INTO controle (mission_id, intervenant_id, type, resultat, commentaire, realise_par) VALUES ($1, $2, $3, $4, $5, $6)',
        [missionId, id, type, resultat, commentaire, ctx.utilisateur.id],
      );
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'controle_qualite', entite: 'mission', entiteId: missionId, details: { reference: m.reference, type, resultat } }, c);
    });
  } catch (e) {
    return { erreurs: { general: e instanceof Error ? e.message : 'Erreur inattendue.' }, valeurs: valeurs(f) };
  }
  rafraichir(missionId);
  return { ok: 'Contrôle enregistré.' };
}

export async function declarerIncident(missionId: string, _: EtatSaisie, f: FormData): Promise<EtatSaisie> {
  const ctx = await exigerAction('mission:modifier');
  const description = String(f.get('description') ?? '').trim().slice(0, 2000);
  const gravite = String(f.get('gravite') ?? '');
  const intervenant = String(f.get('intervenant_id') ?? '');
  const erreurs: Record<string, string> = {};
  if (!description) erreurs.description = 'Décrivez l’incident.';
  if (!(gravite in GRAVITES)) erreurs.gravite = 'Indiquez la gravité.';
  if (Object.keys(erreurs).length) return { erreurs, valeurs: valeurs(f) };
  try {
    await transaction(async (c) => {
      const m = await mission(c, missionId, OUVERTE, 'La déclaration d’un incident');
      const id = UUID.test(intervenant) ? intervenant : null;
      await membreEquipe(c, missionId, id);
      await c.query(
        'INSERT INTO incident (mission_id, intervenant_id, description, gravite, declare_par) VALUES ($1, $2, $3, $4, $5)',
        [missionId, id, description, gravite, ctx.utilisateur.id],
      );
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'incident_declaration', entite: 'mission', entiteId: missionId, details: { reference: m.reference, gravite } }, c);
    });
  } catch (e) {
    return { erreurs: { general: e instanceof Error ? e.message : 'Erreur inattendue.' }, valeurs: valeurs(f) };
  }
  rafraichir(missionId);
  return { ok: 'Incident déclaré.' };
}

export async function resoudreIncident(missionId: string, incidentId: string, _: string | null, f: FormData): Promise<string | null> {
  const ctx = await exigerAction('mission:modifier');
  const resolution = String(f.get('resolution') ?? '').trim().slice(0, 2000);
  if (!resolution) return 'Décrivez comment l’incident a été résolu.';
  try {
    await transaction(async (c) => {
      const m = await mission(c, missionId, OUVERTE, 'La résolution d’un incident');
      const { rowCount } = await c.query(
        `UPDATE incident SET resolution = $3, resolu_le = now(), resolu_par = $4
          WHERE id = $1 AND mission_id = $2 AND resolu_le IS NULL`,
        [incidentId, missionId, resolution, ctx.utilisateur.id],
      );
      if (!rowCount) throw new Error('Incident introuvable ou déjà résolu.');
      await consigner({ utilisateurId: ctx.utilisateur.id, action: 'incident_resolution', entite: 'mission', entiteId: missionId, details: { reference: m.reference } }, c);
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inattendue.';
  }
  rafraichir(missionId);
  return null;
}
