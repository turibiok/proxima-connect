import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accesAutorise, ECHECS_MAX, etatLien, lireDateNaissance, masquerLien, messageAcces } from '../lib/espace/regles.ts';

const maintenant = new Date('2026-11-08T12:00:00Z');
const lien = (o) => ({ expire_le: '2026-11-15T12:00:00Z', utilise_le: null, revoque_le: null, echecs: 0, ...o });

test('etat d’un lien : valide, expire, deja utilise, revoque', () => {
  assert.equal(etatLien(lien(), maintenant), 'valide');
  assert.equal(etatLien(lien({ expire_le: '2026-11-08T12:00:00Z' }), maintenant), 'expire');
  assert.equal(etatLien(lien({ utilise_le: '2026-11-08T10:00:00Z' }), maintenant), 'utilise');
  assert.equal(etatLien(lien({ revoque_le: '2026-11-08T10:00:00Z' }), maintenant), 'revoque');
  assert.equal(etatLien(lien({ echecs: ECHECS_MAX }), maintenant), 'revoque');
  assert.equal(etatLien(lien({ echecs: ECHECS_MAX - 1 }), maintenant), 'valide');
});

test('acces : tous les profils sauf inactif', () => {
  assert.equal(accesAutorise('actif'), true);
  assert.equal(accesAutorise('suspendu'), true);
  assert.equal(accesAutorise('inactif'), false);
});

test('date de naissance : champ date ou saisie a la francaise', () => {
  assert.equal(lireDateNaissance('1998-11-02'), '1998-11-02');
  assert.equal(lireDateNaissance('2/11/1998'), '1998-11-02');
  assert.equal(lireDateNaissance('02.11.1998'), '1998-11-02');
  assert.equal(lireDateNaissance('30/02/1998'), null);
  assert.equal(lireDateNaissance('1998'), null);
});

test('message et masquage du jeton', () => {
  const url = 'https://proxima.example/espace/acces/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab';
  const m = messageAcces('Koffi Serge', url);
  assert.match(m, /^Bonjour Koffi,/);
  assert.ok(m.includes(url));
  const masque = masquerLien(m);
  assert.ok(!masque.includes('AbCdEf'));
  assert.match(masque, /espace\/acces\/\[lien personnel\]/);
  assert.equal(masquerLien('rien à masquer'), 'rien à masquer');
});
