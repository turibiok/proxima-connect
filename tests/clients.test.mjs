import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formaterFCFA,
  lireBrief,
  lireClient,
  lireMontant,
  normaliserIFU,
  normaliserTelephoneContact,
  situationCredit,
} from '../lib/clients/regles.ts';

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

test('montants : ecritures usuelles acceptees, decimales et lettres refusees', () => {
  for (const s of ['1500000', '1 500 000', '1.500.000', '1 500 000 FCFA', '1500000F CFA', '1 500 000']) {
    assert.equal(lireMontant(s), 1500000, s);
  }
  assert.equal(lireMontant(''), null);
  assert.ok(Number.isNaN(lireMontant('environ 2 millions')));
  assert.ok(Number.isNaN(lireMontant('-500')));
});

test('montants : affichage', () => {
  assert.equal(formaterFCFA(1500000), '1 500 000 FCFA');
  assert.equal(formaterFCFA(null), '-');
});

test('IFU : 13 chiffres', () => {
  assert.equal(normaliserIFU('3201 9123 45678'), '3201912345678');
  assert.equal(normaliserIFU('12345'), null);
});

test('telephone contact : beninois normalise, international accepte, +229 mal forme refuse', () => {
  assert.equal(normaliserTelephoneContact('97 12 34 56'), '+2290197123456');
  assert.equal(normaliserTelephoneContact('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(normaliserTelephoneContact('0033612345678'), '+33612345678');
  assert.equal(normaliserTelephoneContact('+229 12 34'), null);
});

test('credit : seuils 80 % et 100 %, limite nulle = pas de limite', () => {
  assert.equal(situationCredit(500_000, 1_000_000).niveau, 'ok');
  assert.equal(situationCredit(800_000, 1_000_000).niveau, 'proche');
  assert.equal(situationCredit(1_000_001, 1_000_000).niveau, 'depasse');
  assert.deepEqual(situationCredit(5_000_000, 0), { encours: 5_000_000, limite: 0, taux: null, niveau: 'ok' });
});

test('client : valeurs par defaut et nettoyage', () => {
  const r = lireClient(formulaire({ raison_sociale: ' Brasserie du Golfe ', contact_email: 'Achats@Golfe.BJ', limite_credit_fcfa: '2 000 000' }));
  assert.equal(r.ok, true);
  assert.equal(r.donnees.raison_sociale, 'Brasserie du Golfe');
  assert.equal(r.donnees.contact_email, 'achats@golfe.bj');
  assert.equal(r.donnees.limite_credit_fcfa, 2_000_000);
  assert.equal(r.donnees.delai_paiement_jours, 30);
  assert.equal(r.donnees.statut_commercial, 'prospect');
});

test('client : raison sociale et un moyen de contact obligatoires', () => {
  const r = lireClient(formulaire({ raison_sociale: '', ifu: '123', acompte_pourcent: '150' }));
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.raison_sociale);
  assert.ok(r.erreurs.contact_telephone);
  assert.ok(r.erreurs.ifu);
  assert.ok(r.erreurs.acompte_pourcent);
});

test('brief : type de mission lu depuis « categorie::type »', () => {
  const r = lireBrief(formulaire({ objectif: 'Relevés de prix', type_mission: 'enquetes::Relevés de prix', nb_profils: '12', budget_fcfa: '900 000', competences: 'Saisie sur smartphone, Fon' }));
  assert.equal(r.ok, true);
  assert.equal(r.donnees.categorie, 'enquetes');
  assert.equal(r.donnees.type_mission, 'Relevés de prix');
  assert.equal(r.donnees.nb_profils, 12);
  assert.equal(r.donnees.budget_fcfa, 900_000);
  assert.deepEqual(r.donnees.competences, ['Saisie sur smartphone', 'Fon']);
});

test('brief : « autre » dans une categorie, type inconnu ignore', () => {
  const r = lireBrief(formulaire({ objectif: 'x', type_mission: 'distribution::Inventé' }));
  assert.equal(r.donnees.categorie, 'distribution');
  assert.equal(r.donnees.type_mission, null);
});

test('brief : dates incoherentes et effectif hors bornes refuses', () => {
  const r = lireBrief(formulaire({ objectif: 'x', type_mission: 'commercial::', date_debut: '2026-11-10', date_fin: '2026-11-02', nb_profils: '0' }));
  assert.equal(r.ok, false);
  assert.match(r.erreurs.date_fin, /précède/);
  assert.ok(r.erreurs.nb_profils);
});
