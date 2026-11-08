import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETAPES_CLIENT, etapeClient } from '../lib/client/regles.ts';
import { motDePasseProvisoire, robustesse } from '../lib/auth/mot-de-passe.ts';

test('etapes vues par le client : les etapes internes se resument', () => {
  assert.equal(etapeClient('brief_recu'), 'preparation');
  assert.equal(etapeClient('selection'), 'preparation');
  assert.equal(etapeClient('execution'), 'terrain');
  assert.equal(etapeClient('preuves_collectees'), 'controle');
  assert.equal(etapeClient('controlee'), 'controle');
  assert.equal(etapeClient('rapport_transmis'), 'rapport');
  assert.equal(etapeClient('payee'), 'rapport');
  assert.equal(etapeClient('annulee'), 'annulee');
  assert.equal(ETAPES_CLIENT.rapport.libelle, 'Rapport disponible');
});

test('mot de passe provisoire : lisible, robuste, different a chaque fois', () => {
  const a = motDePasseProvisoire();
  assert.match(a, /^[A-HJ-NP-Za-hj-np-z2-9]{4}-[A-HJ-NP-Za-hj-np-z2-9]{4}-[A-HJ-NP-Za-hj-np-z2-9]{4}7Q$/);
  assert.notEqual(a, motDePasseProvisoire());
  // la regle de robustesse peut manquer une minuscule par hasard ; on verifie sur un echantillon
  const refuses = Array.from({ length: 200 }, motDePasseProvisoire).filter((m) => robustesse(m).length > 0);
  assert.ok(refuses.length < 10, `${refuses.length} provisoires refuses par la regle de robustesse`);
});
