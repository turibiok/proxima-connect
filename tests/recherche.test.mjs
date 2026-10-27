import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clauseRecherche, lireFiltres } from '../lib/intervenants/recherche.ts';

test('sans filtre : pas de WHERE', () => {
  assert.deepEqual(clauseRecherche({}), { where: '', params: [] });
});

test('les valeurs saisies ne sont jamais dans le SQL', () => {
  const malveillant = "x'; DROP TABLE intervenant; --";
  const { where, params } = clauseRecherche({ q: malveillant, ville: malveillant, zone: malveillant, competence: malveillant });
  assert.ok(!/drop/i.test(where));
  assert.ok(params.some((p) => /drop table/i.test(String(p))));
});

test('recherche par numero : 4 chiffres ou plus interrogent le telephone', () => {
  assert.match(clauseRecherche({ q: '97 12' }).where, /telephone LIKE/);
  assert.doesNotMatch(clauseRecherche({ q: 'Ali' }).where, /telephone/);
});

test('zone : accents retires de la saisie', () => {
  const { params } = clauseRecherche({ zone: 'Fidjrossè' });
  assert.deepEqual(params, ['%fidjrosse%']);
});

test('score minimum non numerique ignore ; filtres cumules', () => {
  assert.equal(clauseRecherche({ score_min: 'abc' }).where, '');
  const { where, params } = clauseRecherche({ statut: 'actif', categorie: 'enquetes', jour: 'sam', score_min: '60' });
  assert.equal(where.split(' AND ').length, 4);
  assert.deepEqual(params, ['actif', 'enquetes', 'sam', 60]);
});

test('lireFiltres : champs vides et inconnus ecartes', () => {
  assert.deepEqual(lireFiltres({ q: '  ', statut: 'actif', page: '2', ville: ['Cotonou', 'Parakou'] }), { statut: 'actif', ville: 'Cotonou' });
});
