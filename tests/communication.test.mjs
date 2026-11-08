import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  finDeCompte,
  lienEnvoi,
  lireEchange,
  lireMessage,
  messageConfirmationPaiement,
  messageRappel,
  quand,
  segmentsSms,
  versSms,
} from '../lib/communication/regles.ts';

const form = (o) => ({ get: (k) => o[k] ?? null });

test('quand : aujourd’hui, demain ou la date', () => {
  assert.equal(quand('2026-11-08', '2026-11-08'), 'aujourd’hui');
  assert.equal(quand('2026-11-09', '2026-11-08'), 'demain (9 nov. 2026)');
  assert.equal(quand('2026-11-14', '2026-11-08'), 'le 14 nov. 2026');
  assert.match(quand('2027-01-01', '2026-12-31'), /^demain/);
});

test('rappel : date, rendez-vous, horaires, consigne d’empechement', () => {
  const m = messageRappel({ prenoms: 'Koffi Serge', titre: 'Relevés de prix', date_debut: '2026-11-09', horaires: '8 h - 13 h', lieu: null, zone: 'Cotonou', aujourdhui: '2026-11-08' });
  assert.match(m, /^Bonjour Koffi,/);
  assert.match(m, /commence demain \(9 nov\. 2026\)/);
  assert.match(m, /Rendez-vous : Cotonou/);
  assert.match(m, /Horaires : 8 h - 13 h/);
  assert.match(m, /remplacement/);
  assert.doesNotMatch(messageRappel({ prenoms: 'A', titre: 'T', date_debut: null, horaires: null, lieu: 'Siège', zone: null, aujourdhui: '2026-11-08' }), /Horaires/);
});

test('confirmation de paiement : montant, reference, compte masque', () => {
  const m = messageConfirmationPaiement({ prenoms: 'Sènan Josué', montant: 50000, titre: 'Relevés', reference: 'M-00001', mode: 'mobile_money', referenceTransaction: 'MP123', compte: '+2290100009901' });
  assert.match(m, /^Bonjour Sènan,/);
  assert.match(m, /versé 50 000 FCFA/);
  assert.match(m, /Mobile Money sur le compte se terminant par 9901/);
  assert.match(m, /Référence : MP123/);
  assert.doesNotMatch(m, /2290100009901/);
  assert.match(messageConfirmationPaiement({ prenoms: 'A', montant: 1, titre: 'T', reference: 'M', mode: 'especes', referenceTransaction: 'R-1', compte: null }), /espèces, contre reçu/);
  assert.equal(finDeCompte('12'), null);
});

test('SMS : 160 caracteres en GSM, 70 en Unicode', () => {
  assert.deepEqual(segmentsSms('Bonjour'), { encodage: 'GSM', caracteres: 7, segments: 1 });
  assert.equal(segmentsSms('é'.repeat(160)).segments, 1); // é est dans l'alphabet GSM
  assert.equal(segmentsSms('a'.repeat(161)).segments, 2);
  assert.equal(segmentsSms('€').caracteres, 2); // caractere etendu : compte double
  assert.deepEqual(segmentsSms('être'), { encodage: 'Unicode', caracteres: 4, segments: 1 });
  assert.equal(segmentsSms('ê' + 'a'.repeat(70)).segments, 2);
});

test('version SMS : garde é è à, remplace ê ç guillemets et apostrophe typographique', () => {
  const t = versSms('« Être à l’heure » : ça compte, déjà. Côte d’Ivoire…');
  assert.equal(t, '" Etre à l\'heure " : ca compte, déjà. Cote d\'Ivoire...');
  assert.equal(segmentsSms(t).encodage, 'GSM');
});

test('liens d’envoi : WhatsApp sans le +, SMS compatible Android et iOS', () => {
  assert.equal(lienEnvoi('whatsapp', '+2290100000002', 'Bonjour à toi'), 'https://wa.me/2290100000002?text=Bonjour%20%C3%A0%20toi');
  assert.equal(lienEnvoi('sms', '+2290100000002', 'Oui & non'), 'sms:+2290100000002?&body=Oui%20%26%20non');
});

test('saisie : message et echange consigne', () => {
  assert.deepEqual(lireMessage(form({ canal: 'sms', modele: 'rappel', contenu: ' Bonjour ' })), { ok: true, donnees: { canal: 'sms', modele: 'rappel', contenu: 'Bonjour' } });
  assert.equal(lireMessage(form({ canal: 'sms', modele: 'libre', contenu: 'Ligne 1\r\nLigne 2' })).donnees.contenu, 'Ligne 1\nLigne 2');
  assert.deepEqual(Object.keys(lireMessage(form({ canal: 'pigeon', modele: 'proposition', contenu: '' })).erreurs).sort(), ['canal', 'contenu', 'modele']);
  assert.equal(lireEchange(form({ canal: 'appel', sens: 'entrant', contenu: 'Demande quand il sera payé' })).ok, true);
  assert.ok(lireEchange(form({ canal: 'appel', sens: 'x', contenu: 'ok ok' })).erreurs.sens);
});
