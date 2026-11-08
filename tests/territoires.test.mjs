import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avancement, signauxTerritoire } from '../lib/territoires/regles.ts';

const t = (o) => ({ statut: 'ouvert', objectif_profils: 100, mobilisables: 80, besoin: 0, en_cours: 0, missions_12m: 3, ...o });

test('territoire sain : aucun signal', () => {
  assert.deepEqual(signauxTerritoire(t()), []);
});

test('demande sans vivier : plus de profils demandes que mobilisables', () => {
  const s = signauxTerritoire(t({ besoin: 12, mobilisables: 5 }));
  assert.equal(s[0].niveau, 'danger');
  assert.match(s[0].message, /12 profils demandés, 5 mobilisables/);
});

test('missions hors territoire ouvert, vivier insuffisant, pret a ouvrir', () => {
  assert.match(signauxTerritoire(t({ statut: 'ferme', en_cours: 1 }))[0].message, /pas ouvert/);
  assert.match(signauxTerritoire(t({ mobilisables: 40 }))[0].message, /Vivier insuffisant : 40 sur un objectif de 100/);
  assert.deepEqual(signauxTerritoire(t({ statut: 'preparation', missions_12m: 0, mobilisables: 100 })), [{ niveau: 'ok', message: 'Objectif de vivier atteint : le territoire peut ouvrir.' }]);
  assert.deepEqual(signauxTerritoire(t({ statut: 'ferme', missions_12m: 0, objectif_profils: null, mobilisables: 0 })), []);
});

test('avancement vers l’objectif', () => {
  assert.equal(avancement(30, 120), 0.25);
  assert.equal(avancement(150, 100), 1);
  assert.equal(avancement(10, null), null);
});
