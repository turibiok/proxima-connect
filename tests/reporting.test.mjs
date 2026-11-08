import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celluleCsv,
  lireIndicateurs,
  lireSatisfaction,
  lireTransmission,
  rentabilite,
  tauxSatisfaction,
  versCsv,
} from '../lib/reporting/regles.ts';

const form = (o) => ({
  get: (k) => (Array.isArray(o[k]) ? o[k][0] : o[k]) ?? null,
  getAll: (k) => (o[k] === undefined ? [] : Array.isArray(o[k]) ? o[k] : [o[k]]),
});

test('indicateurs convenus : lignes vides ignorees, ligne sans nom refusee', () => {
  const ok = lireIndicateurs(form({
    libelle: ['Boutiques visitées', '', 'Références relevées'],
    cible: ['150', '', '12 par boutique'],
    resultat: ['146', '', '1 752'],
    synthese: '  Mission menée à 97 %.  ',
  }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.donnees.indicateurs, [
    { libelle: 'Boutiques visitées', cible: '150', resultat: '146' },
    { libelle: 'Références relevées', cible: '12 par boutique', resultat: '1 752' },
  ]);
  assert.equal(ok.donnees.synthese, 'Mission menée à 97 %.');
  const ko = lireIndicateurs(form({ libelle: ['', 'X'], cible: ['100', ''], resultat: ['', ''] }));
  assert.ok(ko.erreurs.ligne_0);
});

test('transmission du rapport : canal, destinataire, pas dans le futur', () => {
  const maintenant = new Date('2026-11-08T12:00:00Z');
  const ok = lireTransmission(form({ canal: 'email', destinataire: 'achats@exemple.bj', transmis_le: '2026-11-08T12:30' }), maintenant);
  assert.equal(ok.ok, true);
  assert.equal(ok.donnees.le.toISOString(), '2026-11-08T11:30:00.000Z');
  const ko = lireTransmission(form({ canal: 'pigeon', destinataire: '', transmis_le: '2026-11-08T14:00' }), maintenant);
  assert.deepEqual(Object.keys(ko.erreurs).sort(), ['canal', 'destinataire', 'transmis_le']);
});

test('satisfaction : note 1 a 5, une note basse doit etre expliquee', () => {
  assert.deepEqual(lireSatisfaction(form({ note: '5', commentaire: '' })), { ok: true, donnees: { note: 5, commentaire: null } });
  assert.ok(lireSatisfaction(form({ note: '2', commentaire: '' })).erreurs.commentaire);
  assert.equal(lireSatisfaction(form({ note: '2', commentaire: 'Rapport livré en retard' })).ok, true);
  assert.ok(lireSatisfaction(form({ note: '6' })).erreurs.note);
});

test('taux de satisfaction : satisfait a partir de 4 sur 5', () => {
  assert.equal(tauxSatisfaction([]), null);
  assert.equal(tauxSatisfaction([5, 4, 3, 5]), 0.75);
  assert.equal(tauxSatisfaction([4]), 1);
});

test('rentabilite : marge et taux sur le facture', () => {
  assert.deepEqual(rentabilite(1_500_000, 600_000), { marge: 900_000, taux: 0.6 });
  assert.deepEqual(rentabilite(0, 120_000), { marge: -120_000, taux: null });
});

test('CSV pour Excel en francais : separateur, decimales, guillemets, formules neutralisees', () => {
  assert.equal(celluleCsv(12.5), '12,5');
  assert.equal(celluleCsv(-3), '-3');
  assert.equal(celluleCsv(null), '');
  assert.equal(celluleCsv('Dupont; Fils'), '"Dupont; Fils"');
  assert.equal(celluleCsv('Il a dit "oui"'), '"Il a dit ""oui"""');
  assert.equal(celluleCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(celluleCsv('+229 01 00 00 00 01'), "'+229 01 00 00 00 01");
  const csv = versCsv([{ libelle: 'Nom', valeur: (l) => l.nom }, { libelle: 'Score', valeur: (l) => l.score }], [{ nom: 'AGOSSOU', score: 81 }, { nom: 'DOSSOU', score: null }]);
  assert.equal(csv, '﻿Nom;Score\r\nAGOSSOU;81\r\nDOSSOU;\r\n');
});
