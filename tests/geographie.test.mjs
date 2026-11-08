import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALIAS_COMMUNES, COMMUNES, DEPARTEMENTS, cleGeo, departementDe, localiserCommune } from '../lib/geographie.ts';

test('referentiel : 12 departements, 77 communes, sans doublon', () => {
  assert.equal(DEPARTEMENTS.length, 12);
  assert.equal(COMMUNES.length, 77);
  assert.equal(new Set(COMMUNES).size, 77);
  assert.equal(departementDe('Cotonou'), 'Littoral');
  assert.equal(departementDe('Sèmè-Kpodji'), 'Ouémé');
  assert.equal(departementDe('Lomé'), null);
});

test('cle de comparaison : accents, casse, ponctuation', () => {
  assert.equal(cleGeo('Sèmè-Kpodji'), 'seme kpodji');
  assert.equal(cleGeo("N'Dali"), 'n dali');
  assert.equal(cleGeo('  Cotonou : Dantokpa, Ganhi '), 'cotonou dantokpa ganhi');
});

test('commune reconnue dans un texte libre', () => {
  assert.equal(localiserCommune('Cotonou : Dantokpa, Ganhi, Akpakpa'), 'Cotonou');
  assert.equal(localiserCommune('Abomey-Calavi'), 'Abomey-Calavi');
  assert.equal(localiserCommune('Abomey'), 'Abomey'); // pas Abomey-Calavi
  assert.equal(localiserCommune('Sèmè-Podji'), 'Sèmè-Kpodji'); // variante courante
  assert.equal(localiserCommune('Godomey'), 'Abomey-Calavi'); // arrondissement
  assert.equal(localiserCommune('PARAKOU'), 'Parakou');
  assert.equal(localiserCommune('N’Dali'), "N'Dali");
  assert.equal(localiserCommune('Marché de Dantokpa'), 'Cotonou');
  assert.equal(localiserCommune('Lomé'), null);
  assert.equal(localiserCommune(null), null);
});

test('la migration 013 contient exactement le meme referentiel', () => {
  const sql = readFileSync(new URL('../db/migrations/013_geographie.sql', import.meta.url), 'utf8');
  const lire = (s) => s.replace(/''/g, "'");
  const communes = [...sql.matchAll(/\('((?:[^']|'')+)', '((?:[^']|'')+)', cle_geo\('(?:[^']|'')+'\)\)/g)].map((m) => [lire(m[1]), lire(m[2])]);
  const attendu = DEPARTEMENTS.flatMap((d) => d.communes.map((c) => [c, d.nom]));
  assert.deepEqual(new Map(communes), new Map(attendu));
  const alias = [...sql.matchAll(/\(cle_geo\('((?:[^']|'')+)'\), '((?:[^']|'')+)'\)/g)].map((m) => [lire(m[1]), lire(m[2])]);
  assert.deepEqual(new Map(alias), new Map(Object.entries(ALIAS_COMMUNES)));
});
