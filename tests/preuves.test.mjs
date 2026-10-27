import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lignesCsv,
  lireCoordonnees,
  lirePreuve,
  nomPropre,
  restesAControler,
  tauxRejet,
  typeReel,
} from '../lib/preuves/regles.ts';

const octets = (...b) => new Uint8Array([...b, ...new Array(16).fill(0x41)]);
const texte = (s) => new TextEncoder().encode(s);

test('type reel lu dans les octets, pas dans le nom', () => {
  assert.equal(typeReel(octets(0xff, 0xd8, 0xff, 0xe0), 'x.png'), 'image/jpeg');
  assert.equal(typeReel(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'photo'), 'image/png');
  assert.equal(typeReel(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]), 'p.webp'), 'image/webp');
  assert.equal(typeReel(texte('%PDF-1.7 ...'), 'fiche.pdf'), 'application/pdf');
  assert.equal(typeReel(texte('boutique;prix\nA;100\n'), 'releves.csv'), 'text/csv');
});

test('formats dangereux ou inconnus refuses', () => {
  assert.equal(typeReel(texte('<svg onload="alert(1)"></svg>'), 'logo.svg'), null);
  assert.equal(typeReel(texte('<html><script>x</script>'), 'page.csv'), null);
  assert.equal(typeReel(texte('MZ\u0090\u0000'), 'photo.jpg'), null);
  assert.equal(typeReel(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'archive.zip'), null);
});

test('nom de fichier assaini', () => {
  assert.equal(nomPropre('C:\\Users\\x\\Relevé "prix".csv'), 'Relevé _prix_.csv');
  assert.equal(nomPropre('../../etc/passwd'), 'passwd');
});

test('CSV : lignes de donnees', () => {
  assert.equal(lignesCsv('a;b\n1;2\n3;4\n\n'), 2);
  assert.equal(lignesCsv(''), 0);
});

test('coordonnees : virgule decimale, hors Benin signale, impossibles refusees', () => {
  const c = lireCoordonnees('6,3654', '2,4183');
  assert.deepEqual(c, { ok: true, latitude: 6.3654, longitude: 2.4183, horsBenin: false });
  assert.equal(lireCoordonnees('48.85', '2.35').horsBenin, true);
  assert.equal(lireCoordonnees('95', '2').ok, false);
  assert.equal(lireCoordonnees('', '2').ok, false);
});

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.append(k, v);
  return f;
}

test('photo : fichier et consentement exiges', () => {
  const r = lirePreuve(formulaire({ type: 'photo' }), 0);
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.fichiers && r.erreurs.consentement_photo);
  assert.equal(lirePreuve(formulaire({ type: 'photo', consentement_photo: 'oui' }), 2).ok, true);
});

test('geopoint : coordonnees exigees, precision gardee', () => {
  assert.equal(lirePreuve(formulaire({ type: 'geopoint' }), 0).ok, false);
  const r = lirePreuve(formulaire({ type: 'geopoint', latitude: '6.37', longitude: '2.39', precision_m: '12.34' }), 0);
  assert.equal(r.ok, true);
  assert.equal(r.donnees.precision_m, 12.3);
});

test('contre-appel et signature : champs propres', () => {
  const ca = lirePreuve(formulaire({ type: 'contre_appel', appele: 'Gérante boutique', resultat: 'confirme' }), 0);
  assert.equal(ca.ok, true);
  assert.equal(ca.donnees.donnees.resultat, 'confirme');
  assert.equal(lirePreuve(formulaire({ type: 'contre_appel', appele: 'X', resultat: 'peut-etre' }), 0).ok, false);
  assert.ok(lirePreuve(formulaire({ type: 'signature' }), 1).erreurs.signataire);
});

test('bilan : taux de rejet et conditions du controle', () => {
  assert.equal(tauxRejet({ validees: 19, rejetees: 1 }), 0.05);
  assert.equal(tauxRejet({ validees: 0, rejetees: 0 }), null);
  assert.deepEqual(restesAControler({ validees: 4, enAttente: 0, rejetees: 1, incidentsBloquants: 0 }), []);
  assert.equal(restesAControler({ validees: 0, enAttente: 2, rejetees: 0, incidentsBloquants: 1 }).length, 3);
});
