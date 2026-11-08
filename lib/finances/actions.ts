'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { transaction } from '@/lib/db';
import { exigerAction } from '@/lib/auth/session';
import { consigner } from '@/lib/journal';
import {
  aujourdhuiBenin,
  delaiPaiement,
  lireFacture,
  lireLeveeLitige,
  lirePaiement,
  lireReglement,
  numeroFacture,
  statutApresReglement,
  TYPES_FACTURE,
} from './regles';

export type EtatFinance = { erreurs?: Record<string, string>; valeurs?: Record<string, string>; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

function valeurs(f: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, x] of f.entries()) if (typeof x === 'string' && !k.startsWith('$')) v[k] = x;
  return v;
}

/** Message lisible, y compris pour une reference de transaction deja saisie (index unique). */
function erreur(e: unknown): string {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err?.code === '23505' && /transaction/.test(err.constraint ?? '')) {
    return 'Cette référence de transaction est déjà enregistrée : vérifiez qu’il ne s’agit pas d’une saisie en double.';
  }
  return e instanceof Error ? e.message : 'Erreur inattendue.';
}

/** Retour d'une erreur metier levee dans une transaction, sans la confondre avec une panne. */
class Refus extends Error {
  constructor(public erreurs: Record<string, string>) {
    super(Object.values(erreurs)[0]);
  }
}

function rafraichirFinances(chemins: (string | null | undefined)[] = []) {
  revalidatePath('/finances', 'layout');
  revalidatePath('/');
  for (const c of chemins) if (c) revalidatePath(c);
}

// ------------------------------------------------------------ paiements des intervenants

/** Verse le paiement : le compte credite est fige depuis la fiche de l'intervenant. */
export async function payer(paiementId: string, _: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('paiement:gerer');
  const r = lirePaiement(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  let missionId = '';
  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT p.*, m.reference, i.nom, i.prenoms, i.paiement_compte, i.paiement_operateur
           FROM paiement_intervenant p JOIN mission m ON m.id = p.mission_id JOIN intervenant i ON i.id = p.intervenant_id
          WHERE p.id = $1 FOR UPDATE OF p`,
        [paiementId],
      );
      const p = rows[0];
      if (!p) throw new Error('Paiement introuvable.');
      if (p.statut === 'paye') throw new Error('Ce paiement est déjà enregistré.');
      if (p.statut === 'en_litige') throw new Error('Levez d’abord le litige.');
      if (r.donnees.mode !== 'especes' && !p.paiement_compte) {
        throw new Error('Le profil n’a pas de compte de paiement : complétez la fiche, ou payez en espèces contre reçu signé.');
      }
      missionId = p.mission_id;
      await c.query(
        `UPDATE paiement_intervenant
            SET statut = 'paye', mode = $2, reference_transaction = $3, paye_le = $4, paye_par = $5,
                compte_beneficiaire = $6, operateur = $7
          WHERE id = $1`,
        [
          paiementId, r.donnees.mode, r.donnees.reference, r.donnees.payeLe, ctx.utilisateur.id,
          r.donnees.mode === 'especes' ? null : p.paiement_compte, r.donnees.mode === 'especes' ? null : p.paiement_operateur,
        ],
      );
      await consigner(
        {
          utilisateurId: ctx.utilisateur.id, action: 'paiement_verse', entite: 'mission', entiteId: p.mission_id,
          details: {
            reference: p.reference, intervenant: `${p.nom} ${p.prenoms}`, montant: Number(p.montant_fcfa), mode: r.donnees.mode,
            delai_heures: delaiPaiement(p.du_depuis, r.donnees.payeLe).heures,
          },
        },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichirFinances([`/missions/${missionId}`]);
  return { ok: 'Paiement enregistré.' };
}

/** Met un paiement en litige (montant conteste, presence discutee…) : il sort du delai a tenir. */
export async function mettreEnLitige(paiementId: string, _: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('paiement:gerer');
  const motif = String(f.get('motif') ?? '').trim().slice(0, 1000);
  if (motif.length < 5) return { erreurs: { motif: 'Décrivez l’objet du litige.' } };
  let missionId = '';
  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT p.statut, p.mission_id, m.reference, i.nom, i.prenoms FROM paiement_intervenant p
           JOIN mission m ON m.id = p.mission_id JOIN intervenant i ON i.id = p.intervenant_id WHERE p.id = $1 FOR UPDATE OF p`,
        [paiementId],
      );
      const p = rows[0];
      if (!p) throw new Error('Paiement introuvable.');
      if (p.statut !== 'a_payer') throw new Error('Seul un paiement à verser peut être mis en litige.');
      missionId = p.mission_id;
      await c.query(
        `UPDATE paiement_intervenant SET statut = 'en_litige', litige_motif = $2, litige_le = now(), litige_par = $3 WHERE id = $1`,
        [paiementId, motif, ctx.utilisateur.id],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'paiement_litige', entite: 'mission', entiteId: p.mission_id, details: { reference: p.reference, intervenant: `${p.nom} ${p.prenoms}`, motif } },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) } };
  }
  rafraichirFinances([`/missions/${missionId}`]);
  return { ok: 'Paiement mis en litige.' };
}

/** Leve le litige : le paiement redevient a verser, au montant corrige s'il y a lieu. */
export async function leverLitige(paiementId: string, _: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('paiement:gerer');
  const r = lireLeveeLitige(f);
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  let missionId = '';
  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT p.statut, p.mission_id, p.montant_fcfa, m.reference, i.nom, i.prenoms FROM paiement_intervenant p
           JOIN mission m ON m.id = p.mission_id JOIN intervenant i ON i.id = p.intervenant_id WHERE p.id = $1 FOR UPDATE OF p`,
        [paiementId],
      );
      const p = rows[0];
      if (!p) throw new Error('Paiement introuvable.');
      if (p.statut !== 'en_litige') throw new Error('Ce paiement n’est pas en litige.');
      missionId = p.mission_id;
      const montant = r.donnees.montant ?? Number(p.montant_fcfa);
      await c.query(
        `UPDATE paiement_intervenant SET statut = 'a_payer', litige_resolution = $2, montant_fcfa = $3 WHERE id = $1`,
        [paiementId, r.donnees.explication, montant],
      );
      await consigner(
        {
          utilisateurId: ctx.utilisateur.id, action: 'paiement_litige_leve', entite: 'mission', entiteId: p.mission_id,
          details: {
            reference: p.reference, intervenant: `${p.nom} ${p.prenoms}`, motif: r.donnees.explication,
            ...(montant !== Number(p.montant_fcfa) ? { ancien_montant: Number(p.montant_fcfa), montant } : {}),
          },
        },
        c,
      );
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichirFinances([`/missions/${missionId}`]);
  return { ok: 'Litige levé : le paiement est de nouveau à verser.' };
}

// ------------------------------------------------------------ factures et acomptes

/**
 * Emet une facture ou un acompte. Le numero est pris dans la meme
 * transaction que l'emission : la numerotation reste continue.
 */
export async function emettreFacture(_: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('facture:gerer');
  const clientId = String(f.get('client_id') ?? '');
  const missionId = String(f.get('mission_id') ?? '') || null;
  if (!UUID.test(clientId)) return { erreurs: { general: 'Client introuvable.' }, valeurs: valeurs(f) };
  if (missionId && !UUID.test(missionId)) return { erreurs: { mission_id: 'Mission introuvable.' }, valeurs: valeurs(f) };
  const r = lireFacture(f, { aujourdhui: aujourdhuiBenin(), missionLiee: !!missionId });
  if (!r.ok) return { erreurs: r.erreurs, valeurs: valeurs(f) };
  const d = r.donnees;

  let id: string;
  try {
    id = await transaction(async (c) => {
      const { rows: cl } = await c.query('SELECT raison_sociale FROM client WHERE id = $1', [clientId]);
      if (!cl[0]) throw new Error('Client introuvable.');
      let reference: string | null = null;
      if (missionId) {
        const { rows: m } = await c.query('SELECT client_id, reference FROM mission WHERE id = $1', [missionId]);
        if (!m[0] || m[0].client_id !== clientId) throw new Refus({ mission_id: 'Cette mission n’appartient pas à ce client.' });
        reference = m[0].reference;
      }
      const prefixe = TYPES_FACTURE[d.type].prefixe;
      const annee = Number(d.emise_le.slice(0, 4));
      const { rows: n } = await c.query<{ dernier: number }>(
        `INSERT INTO numerotation (prefixe, annee, dernier) VALUES ($1, $2, 1)
         ON CONFLICT (prefixe, annee) DO UPDATE SET dernier = numerotation.dernier + 1 RETURNING dernier`,
        [prefixe, annee],
      );
      const numero = numeroFacture(prefixe, annee, n[0].dernier);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO facture (numero, client_id, mission_id, type, tresorerie, objet, montant_fcfa, emise_le, echeance_le, statut, emise_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'emise', $10) RETURNING id`,
        [numero, clientId, missionId, d.type, d.tresorerie, d.objet, d.montant, d.emise_le, d.echeance_le, ctx.utilisateur.id],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'facture_emission', entite: 'client', entiteId: clientId, details: { numero, montant: d.montant, mission: reference ?? undefined } },
        c,
      );
      return rows[0].id;
    });
  } catch (e) {
    return { erreurs: e instanceof Refus ? e.erreurs : { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichirFinances([`/clients/${clientId}`, missionId && `/missions/${missionId}`]);
  redirect(`/finances/factures/${id}`);
}

/** Enregistre un reglement recu ; la facture passe « reglee en partie » ou « reglee ». */
export async function enregistrerReglement(factureId: string, _: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('facture:gerer');
  let chemins: (string | null)[] = [];
  let message = '';
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT * FROM facture WHERE id = $1 FOR UPDATE', [factureId]);
      const fa = rows[0];
      if (!fa) throw new Error('Facture introuvable.');
      if (fa.statut === 'annulee') throw new Error('Cette facture est annulée.');
      const reste = Number(fa.montant_fcfa) - Number(fa.montant_regle_fcfa);
      if (reste <= 0) throw new Error('Cette facture est déjà soldée.');
      const r = lireReglement(f, { reste, aujourdhui: aujourdhuiBenin() });
      if (!r.ok) throw new Refus(r.erreurs);
      const regle = Number(fa.montant_regle_fcfa) + r.donnees.montant;
      const statut = statutApresReglement(Number(fa.montant_fcfa), regle);
      await c.query(
        `INSERT INTO reglement (facture_id, montant_fcfa, mode, reference_transaction, regle_le, saisi_par) VALUES ($1, $2, $3, $4, $5, $6)`,
        [factureId, r.donnees.montant, r.donnees.mode, r.donnees.reference, r.donnees.regle_le, ctx.utilisateur.id],
      );
      await c.query('UPDATE facture SET montant_regle_fcfa = $2, statut = $3 WHERE id = $1', [factureId, regle, statut]);
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'facture_reglement', entite: 'client', entiteId: fa.client_id, details: { numero: fa.numero, montant: r.donnees.montant, mode: r.donnees.mode } },
        c,
      );
      chemins = [`/clients/${fa.client_id}`, fa.mission_id && `/missions/${fa.mission_id}`];
      message = statut === 'reglee' ? 'Règlement enregistré : la facture est soldée.' : 'Règlement enregistré.';
    });
  } catch (e) {
    return { erreurs: e instanceof Refus ? e.erreurs : { general: erreur(e) }, valeurs: valeurs(f) };
  }
  rafraichirFinances([`/finances/factures/${factureId}`, ...chemins]);
  return { ok: message };
}

/** Annule une facture emise par erreur. Une facture deja encaissee, meme en partie, ne s'annule pas. */
export async function annulerFacture(factureId: string, _: EtatFinance, f: FormData): Promise<EtatFinance> {
  const ctx = await exigerAction('facture:gerer');
  const motif = String(f.get('motif') ?? '').trim().slice(0, 500);
  if (motif.length < 5) return { erreurs: { motif: 'Indiquez le motif de l’annulation.' } };
  let chemins: (string | null)[] = [];
  try {
    await transaction(async (c) => {
      const { rows } = await c.query('SELECT numero, statut, montant_regle_fcfa, client_id, mission_id FROM facture WHERE id = $1 FOR UPDATE', [factureId]);
      const fa = rows[0];
      if (!fa) throw new Error('Facture introuvable.');
      if (fa.statut === 'annulee') throw new Error('Cette facture est déjà annulée.');
      if (Number(fa.montant_regle_fcfa) > 0) throw new Error('Cette facture a déjà reçu un règlement : elle ne peut plus être annulée.');
      await c.query(
        `UPDATE facture SET statut = 'annulee', motif_annulation = $2, annulee_le = now(), annulee_par = $3 WHERE id = $1`,
        [factureId, motif, ctx.utilisateur.id],
      );
      await consigner(
        { utilisateurId: ctx.utilisateur.id, action: 'facture_annulation', entite: 'client', entiteId: fa.client_id, details: { numero: fa.numero, motif } },
        c,
      );
      chemins = [`/clients/${fa.client_id}`, fa.mission_id && `/missions/${fa.mission_id}`];
    });
  } catch (e) {
    return { erreurs: { general: erreur(e) } };
  }
  rafraichirFinances([`/finances/factures/${factureId}`, ...chemins]);
  return { ok: 'Facture annulée.' };
}
