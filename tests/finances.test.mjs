import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJours,
  aujourdhuiBenin,
  delaiPaiement,
  libelleDuree,
  lireDateHeure,
  lireFacture,
  lireLeveeLitige,
  lirePaiement,
  lireReglement,
  modeParDefaut,
  numeroFacture,
  paiementsDus,
  situationFacture,
  statutApresReglement,
  suggestionsFacture,
} from '../lib/finances/regles.ts';
import { refusTransition } from '../lib/missions/regles.ts';

const form = (o) => ({ get: (k) => o[k] ?? null });

test('date du jour au Benin : UTC+1', () => {
  assert.equal(aujourdhuiBenin(new Date('2026-11-08T22:59:00Z')), '2026-11-08');
  assert.equal(aujourdhuiBenin(new Date('2026-11-08T23:01:00Z')), '2026-11-09');
  assert.equal(ajouterJours('2026-12-15', 30), '2027-01-14');
});

test('saisie datetime-local lue a l’heure du Benin', () => {
  assert.equal(lireDateHeure('2026-11-08T10:30').toISOString(), '2026-11-08T09:30:00.000Z');
  assert.equal(lireDateHeure('08/11/2026 10:30'), null);
});

test('delai de paiement : objectif 48 h, limite 72 h', () => {
  const valide = new Date('2026-11-01T10:00:00Z');
  assert.deepEqual(delaiPaiement(valide, new Date('2026-11-02T09:00:00Z')), { heures: 23, niveau: 'ok' });
  assert.equal(delaiPaiement(valide, new Date('2026-11-03T10:00:00Z')).niveau, 'ok'); // 48 h pile
  assert.equal(delaiPaiement(valide, null, new Date('2026-11-04T09:00:00Z')).niveau, 'attention'); // 71 h, pas paye
  assert.deepEqual(delaiPaiement(valide, null, new Date('2026-11-05T10:00:00Z')), { heures: 96, niveau: 'retard' });
  assert.equal(libelleDuree(5), '5 h');
  assert.equal(libelleDuree(51), '2 j 3 h');
  assert.equal(libelleDuree(72), '3 j');
});

test('paiements dus : titulaires engages et presents, montant annonce', () => {
  const l = (intervenant_id, o) => ({ intervenant_id, role: 'titulaire', reponse: 'accepte', presence: 'present', remuneration_proposee_fcfa: 10_000, ...o });
  const { dus, sansMontant } = paiementsDus(
    [
      l('present'),
      l('retard', { presence: 'retard' }), // un retard est paye
      l('absent', { presence: 'absent' }),
      l('reserve', { role: 'remplacant' }),
      l('refus', { reponse: 'refuse', presence: null }),
      l('ancien', { remuneration_proposee_fcfa: null }), // proposition sans montant fige : remuneration de la mission
    ],
    12_000,
  );
  assert.deepEqual(dus, [
    { intervenant_id: 'present', montant: 10_000 },
    { intervenant_id: 'retard', montant: 10_000 },
    { intervenant_id: 'ancien', montant: 12_000 },
  ]);
  assert.deepEqual(sansMontant, []);
  assert.deepEqual(paiementsDus([l('x', { remuneration_proposee_fcfa: null })], null).sansMontant, ['x']);
});

test('mode de paiement propose d’apres la fiche', () => {
  assert.equal(modeParDefaut('banque'), 'virement');
  assert.equal(modeParDefaut('mobile_money'), 'mobile_money');
  assert.equal(modeParDefaut(null), 'mobile_money');
});

test('saisie d’un paiement : reference et date obligatoires, pas dans le futur', () => {
  const maintenant = new Date('2026-11-08T12:00:00Z');
  const ok = lirePaiement(form({ mode: 'mobile_money', reference: 'MP261108.1203.A1', paye_le: '2026-11-08T12:30' }), maintenant);
  assert.equal(ok.ok, true);
  assert.equal(ok.donnees.payeLe.toISOString(), '2026-11-08T11:30:00.000Z');
  const ko = lirePaiement(form({ mode: 'cheque', reference: '', paye_le: '2026-11-09T09:00' }), maintenant);
  assert.deepEqual(Object.keys(ko.erreurs).sort(), ['mode', 'paye_le', 'reference']);
  assert.match(lirePaiement(form({ mode: 'especes', reference: '', paye_le: '2026-11-08T10:00' }), maintenant).erreurs.reference, /reçu/);
});

test('levee de litige : explication obligatoire, montant corrige facultatif', () => {
  assert.deepEqual(lireLeveeLitige(form({ explication: 'Demi-journée seulement, accord écrit.', montant: '5 000' })), {
    ok: true,
    donnees: { explication: 'Demi-journée seulement, accord écrit.', montant: 5000 },
  });
  assert.equal(lireLeveeLitige(form({ explication: 'Vérifié', montant: '' })).donnees.montant, null);
  assert.ok(lireLeveeLitige(form({ explication: '', montant: 'abc' })).erreurs.montant);
});

test('numerotation et statut des factures', () => {
  assert.equal(numeroFacture('FA', 2026, 7), 'FA-2026-0007');
  assert.equal(statutApresReglement(100_000, 0), 'emise');
  assert.equal(statutApresReglement(100_000, 40_000), 'partielle');
  assert.equal(statutApresReglement(100_000, 100_000), 'reglee');
});

test('situation d’une facture : a echoir, echue, retard important au-dela de 15 jours', () => {
  const f = { statut: 'emise', montant_fcfa: 500_000, montant_regle_fcfa: 200_000, echeance_le: '2026-11-01' };
  assert.deepEqual(situationFacture(f, '2026-10-30'), { reste: 300_000, joursRetard: 0, niveau: 'a_echoir' });
  assert.deepEqual(situationFacture(f, '2026-11-10'), { reste: 300_000, joursRetard: 9, niveau: 'echue' });
  assert.equal(situationFacture(f, '2026-11-16').niveau, 'echue'); // 15 jours : pas encore « important »
  assert.equal(situationFacture(f, '2026-11-17').niveau, 'retard_important');
  assert.equal(situationFacture({ ...f, montant_regle_fcfa: 500_000 }, '2026-12-31').niveau, 'soldee');
  assert.equal(situationFacture({ ...f, statut: 'annulee' }, '2026-12-31').reste, 0);
});

test('suggestions : acompte du client d’abord, puis solde deduit des acomptes', () => {
  const base = { budget: 1_000_000, acomptePourcent: 30, delaiJours: 30, acomptesFactures: 0, facturesEmises: 0, aujourdhui: '2026-11-08' };
  const s = suggestionsFacture(base);
  assert.equal(s.type, 'acompte');
  assert.deepEqual(s.montant, { acompte: 300_000, facture: 1_000_000 });
  assert.deepEqual(s.echeance, { acompte: '2026-11-08', facture: '2026-12-08' });
  const apres = suggestionsFacture({ ...base, acomptesFactures: 300_000 });
  assert.equal(apres.type, 'facture');
  assert.deepEqual(apres.montant, { acompte: null, facture: 700_000 });
  assert.equal(suggestionsFacture({ ...base, acomptesFactures: 300_000, facturesEmises: 700_000 }).montant.facture, null);
  assert.deepEqual(suggestionsFacture({ ...base, budget: null }).montant, { acompte: null, facture: null });
});

test('emission : controles et tresorerie imposee pour une mission', () => {
  const c = { aujourdhui: '2026-11-08', missionLiee: true };
  const ok = lireFacture(form({ type: 'facture', objet: 'Relevés de prix', montant: '700 000', emise_le: '2026-11-08', echeance_le: '2026-12-08', tresorerie: 'administrative' }), c);
  assert.equal(ok.ok, true);
  assert.equal(ok.donnees.tresorerie, 'missions');
  assert.equal(ok.donnees.montant, 700_000);
  const ko = lireFacture(form({ type: 'devis', objet: '', montant: '0', emise_le: '2026-11-09', echeance_le: '2026-11-01' }), { ...c, missionLiee: false });
  assert.deepEqual(Object.keys(ko.erreurs).sort(), ['echeance_le', 'emise_le', 'montant', 'objet', 'tresorerie', 'type']);
  const avant = lireFacture(form({ type: 'facture', objet: 'Formation', montant: '50000', emise_le: '2026-11-08', echeance_le: '2026-11-01', tresorerie: 'administrative' }), { ...c, missionLiee: false });
  assert.ok(avant.erreurs.echeance_le);
  assert.ok(lireFacture(form({ type: 'facture', objet: 'X y z', montant: '1', emise_le: '2026-02-30', echeance_le: '2026-03-01' }), c).erreurs.emise_le);
});

test('reglement : jamais au-dela du reste a payer', () => {
  const c = { reste: 300_000, aujourdhui: '2026-11-08' };
  assert.equal(lireReglement(form({ montant: '300 000', mode: 'virement', reference: 'VIR-88231', regle_le: '2026-11-07' }), c).ok, true);
  assert.match(lireReglement(form({ montant: '300 001', mode: 'virement', reference: 'VIR-88231', regle_le: '2026-11-07' }), c).erreurs.montant, /dépasse/);
  const ko = lireReglement(form({ montant: '', mode: 'troc', reference: '', regle_le: '2026-11-09' }), c);
  assert.deepEqual(Object.keys(ko.erreurs).sort(), ['mode', 'montant', 'reference', 'regle_le']);
});

test('etape « payee » : intervenants payes et facture soldee', () => {
  const etat = (finances) => ({ engages: 2, requis: 2, briefing: true, presencesManquantes: 0, finances });
  assert.match(refusTransition('rapport_transmis', 'payee', etat({ paiementsOuverts: 2, factures: 1, nonSoldees: 0 })), /2 paiements d’intervenant/);
  assert.match(refusTransition('rapport_transmis', 'payee', etat({ paiementsOuverts: 0, factures: 0, nonSoldees: 1 })), /Émettez la facture/);
  assert.match(refusTransition('rapport_transmis', 'payee', etat({ paiementsOuverts: 0, factures: 1, nonSoldees: 1 })), /1 facture du client à encaisser/);
  assert.equal(refusTransition('rapport_transmis', 'payee', etat({ paiementsOuverts: 0, factures: 1, nonSoldees: 0 })), null);
});
