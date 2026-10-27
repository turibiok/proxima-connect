import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageRevolu,
  afficherTelephone,
  controles,
  lireInscription,
  normaliserTelephone,
  refusTransition,
} from '../lib/intervenants/regles.ts';

const REF = new Date(Date.UTC(2026, 9, 27));

test('telephone : les ecritures courantes donnent la meme forme', () => {
  for (const s of ['0197123456', '01 97 12 34 56', '+229 01 97 12 34 56', '00229-01-97-12-34-56', '97123456', '97.12.34.56']) {
    assert.equal(normaliserTelephone(s), '+2290197123456', s);
  }
});

test('telephone : numeros invalides refuses', () => {
  for (const s of ['', '1234', '0297123456', '+33612345678', '01971234567', 'abc']) {
    assert.equal(normaliserTelephone(s), null, s);
  }
});

test('telephone : affichage groupe', () => {
  assert.equal(afficherTelephone('+2290197123456'), '+229 01 97 12 34 56');
});

test('age : anniversaire le jour meme, la veille, date impossible', () => {
  assert.equal(ageRevolu('2008-10-27', REF), 18);
  assert.equal(ageRevolu('2008-10-28', REF), 17);
  assert.equal(ageRevolu('2001-02-30', REF), null);
  assert.equal(ageRevolu('27/10/2000', REF), null);
});

const base = {
  date_naissance: '2000-01-01',
  identite_verifiee_le: null,
  telephone_verifie_le: null,
  paiement_verifie_le: null,
  paiement_mode: 'mobile_money',
  paiement_compte: '+2290197123456',
};

test('controles : seul l age est valide a l inscription', () => {
  const c = controles(base, REF);
  assert.deepEqual(c.map((x) => [x.code, x.ok]), [['identite', false], ['age', true], ['telephone', false], ['paiement', false]]);
});

test('statut : verifie refuse tant que les controles manquent', () => {
  assert.match(refusTransition('en_attente', 'verifie', base, '', REF), /quatre contrôles/);
  const complet = { ...base, identite_verifiee_le: REF, telephone_verifie_le: REF, paiement_verifie_le: REF };
  assert.equal(refusTransition('en_attente', 'verifie', complet, '', REF), null);
});

test('statut : suspension sans motif refusee, transition inconnue refusee', () => {
  assert.match(refusTransition('actif', 'suspendu', base, '  ', REF), /motif/);
  assert.equal(refusTransition('actif', 'suspendu', base, 'Absences répétées', REF), null);
  assert.match(refusTransition('actif', 'en_attente', base, '', REF), /pas permis/);
});

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) {
    for (const x of [v].flat()) f.append(k, x);
  }
  return f;
}

const valide = {
  nom: 'Houngbo',
  prenoms: 'Afi Mireille',
  date_naissance: '2003-05-14',
  telephone: '97 12 34 56',
  ville: 'Cotonou',
  zones: 'Akpakpa, Fidjrossè',
  categories: ['distribution', 'enquetes', 'inconnue'],
  jours: ['sam', 'dim'],
  paiement_mode: 'mobile_money',
  paiement_operateur: 'MTN MoMo',
  paiement_compte: '0197123456',
  consentement: 'oui',
};

test('inscription valide : donnees nettoyees', () => {
  const r = lireInscription(formulaire(valide), REF);
  assert.equal(r.ok, true);
  assert.equal(r.donnees.nom, 'HOUNGBO');
  assert.equal(r.donnees.telephone, '+2290197123456');
  assert.deepEqual(r.donnees.zones, ['Akpakpa', 'Fidjrossè']);
  assert.deepEqual(r.donnees.categories_missions, ['distribution', 'enquetes']);
  assert.equal(r.donnees.paiement_compte, '+2290197123456');
});

test('inscription : mineur et sans consentement refuses', () => {
  const r = lireInscription(formulaire({ ...valide, date_naissance: '2010-01-01', consentement: '' }), REF);
  assert.equal(r.ok, false);
  assert.match(r.erreurs.date_naissance, /18 ans/);
  assert.ok(r.erreurs.consentement);
});
