import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajusterProportions, cadre, CONTOUR_BENIN, dansCadre, projeter, serieMensuelle, VILLES_REPERES } from '../lib/observatoire/regles.ts';

test('contour du Benin ferme, villes reperes a l’interieur du cadre national', () => {
  assert.deepEqual(CONTOUR_BENIN[0], CONTOUR_BENIN.at(-1));
  const c = cadre(CONTOUR_BENIN.map(([lon, lat]) => ({ lon, lat })), 0);
  for (const v of VILLES_REPERES) assert.ok(dansCadre(v, c), v.nom);
});

test('cadre : marge, etendue minimale pour un point isole', () => {
  assert.equal(cadre([]), null);
  const c = cadre([{ lon: 2.4, lat: 6.4 }], 0.1, 0.02);
  assert.ok(Math.abs(c.maxLon - c.minLon - 0.024) < 1e-9);
  assert.ok(dansCadre({ lon: 2.4, lat: 6.4 }, c));
  const d = cadre([{ lon: 2, lat: 6 }, { lon: 3, lat: 7 }], 0.1);
  assert.deepEqual([d.minLon, d.maxLon].map((x) => +x.toFixed(2)), [1.9, 3.1]);
});

test('projection : coins du cadre aux coins du dessin, nord en haut', () => {
  const c = { minLon: 2, maxLon: 3, minLat: 6, maxLat: 7 };
  assert.deepEqual(projeter({ lon: 2, lat: 7 }, c, 100, 50), { x: 0, y: 0 });
  assert.deepEqual(projeter({ lon: 3, lat: 6 }, c, 100, 50), { x: 100, y: 50 });
});

test('proportions : le cadre s’elargit sans deformer', () => {
  const c = ajusterProportions({ minLon: 2, maxLon: 3, minLat: 6, maxLat: 7 }, 400, 200);
  const k = Math.cos(((c.minLat + c.maxLat) / 2) * Math.PI / 180);
  assert.ok(Math.abs(((c.maxLon - c.minLon) * k) / (c.maxLat - c.minLat) - 2) < 1e-9);
  assert.ok(c.minLat <= 6 && c.maxLat >= 7);
});

test('serie mensuelle : 12 derniers mois, dates et instants', () => {
  const s = serieMensuelle(['2026-11-03', '2026-11-30', '2026-01-15', '2025-11-02', new Date('2026-10-31T23:30:00Z')], '2026-11');
  assert.equal(s.length, 12);
  assert.equal(s[0].mois, '2025-12');
  assert.equal(s[11].mois, '2026-11');
  assert.equal(s[11].total, 3); // le 31 oct. 23 h 30 UTC est deja le 1er nov. au Benin
  assert.equal(s[1].total, 1);
  assert.equal(s.reduce((t, x) => t + x.total, 0), 4); // novembre 2025 est hors fenetre
  assert.equal(s[11].libelle, 'nov. 26');
});
