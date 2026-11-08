import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  canalAutomatique,
  choisirCandidats,
  configFournisseur,
  envoiAutomatiquePossible,
  etapeProposition,
  lireReponseSms,
  messageRelance,
  nombreReserve,
} from '../lib/automatisation/regles.ts';
import { envoyerTwilio, signatureTwilio, signatureValide } from '../lib/automatisation/twilio.ts';

test('reserve : arrondie au superieur', () => {
  assert.equal(nombreReserve(10, 20), 2);
  assert.equal(nombreReserve(3, 20), 1);
  assert.equal(nombreReserve(5, 0), 0);
});

test('choix des candidats : eligibles, mieux classes, hors deja sollicites', () => {
  const c = (id, points, score = null, eligible = true) => ({ id, points, score, eligible });
  const r = choisirCandidats(
    [c('a', 90, 80), c('b', 95, 40), c('c', 90, 60), c('d', 99, 90, false), c('e', 70), c('f', 100)],
    { titulaires: 2, remplacants: 2, exclus: new Set(['f']) },
  );
  // d non eligible, f deja sollicite ; a passe devant c a points egaux grace au score
  assert.deepEqual(r, { titulaires: ['b', 'a'], remplacants: ['c', 'e'] });
  assert.deepEqual(choisirCandidats([c('a', 50)], { titulaires: 0, remplacants: 0, exclus: new Set() }), { titulaires: [], remplacants: [] });
});

test('cycle d’une proposition : relance a mi-delai, expiration au terme', () => {
  const p = { proposee_le: '2026-11-08T08:00:00Z', proposition_expire_le: '2026-11-09T08:00:00Z', relance_le: null };
  assert.equal(etapeProposition(p, new Date('2026-11-08T19:00:00Z')), 'en_cours');
  assert.equal(etapeProposition(p, new Date('2026-11-08T20:00:00Z')), 'a_relancer');
  assert.equal(etapeProposition({ ...p, relance_le: '2026-11-08T20:00:00Z' }, new Date('2026-11-09T07:00:00Z')), 'en_cours');
  assert.equal(etapeProposition(p, new Date('2026-11-09T08:00:00Z')), 'expiree');
});

test('relance : echeance a l’heure du Benin', () => {
  const m = messageRelance('Koffi Serge', 'Relevés', new Date('2026-11-09T08:00:00Z'));
  assert.match(m, /^Bonjour Koffi,/);
  assert.match(m, /avant le 9 nov\. 2026 à 09:00/);
});

test('reponse par SMS : premier mot, accents et variantes', () => {
  for (const t of ['OUI', 'oui merci', ' Oui, je viens', 'ok', "D'accord", '1']) assert.equal(lireReponseSms(t), 'accepte', t);
  for (const t of ['NON', 'non désolé', 'No', '2', 'Indisponible ce jour']) assert.equal(lireReponseSms(t), 'refuse', t);
  for (const t of ['', 'Bonjour', 'Peut-être', 'Quel est le lieu ?']) assert.equal(lireReponseSms(t), null, t);
});

test('fournisseur : aucun par defaut, simulation explicite, Twilio complet ou erreur', () => {
  assert.deepEqual(configFournisseur({}), { mode: 'aucun' });
  assert.equal(envoiAutomatiquePossible(configFournisseur({})), false);
  assert.deepEqual(configFournisseur({ COMMUNICATION_FOURNISSEUR: 'simulation' }), { mode: 'simulation' });
  assert.equal(envoiAutomatiquePossible({ mode: 'simulation' }), true);
  assert.match(configFournisseur({ COMMUNICATION_FOURNISSEUR: 'orange' }).message, /inconnu/);
  assert.match(configFournisseur({ COMMUNICATION_FOURNISSEUR: 'twilio', TWILIO_ACCOUNT_SID: 'AC1' }).message, /TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM/);
  const t = configFournisseur({ COMMUNICATION_FOURNISSEUR: 'Twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'x', TWILIO_SMS_FROM: '+15550001111' });
  assert.equal(t.mode, 'twilio');
  assert.equal(canalAutomatique(t), 'sms');
  assert.equal(canalAutomatique({ ...t, whatsappFrom: '+15550002222' }), 'whatsapp');
  assert.equal(canalAutomatique({ mode: 'simulation' }), 'sms');
});

test('signature Twilio : URL puis parametres tries, HMAC-SHA1 en base64', () => {
  const params = { To: '+229', Body: 'OUI', From: '+2290100000002' };
  const attendue = createHmac('sha1', 'secret').update('https://ex.bj/api' + 'BodyOUI' + 'From+2290100000002' + 'To+229').digest('base64');
  assert.equal(signatureTwilio('secret', 'https://ex.bj/api', params), attendue);
  assert.equal(signatureValide('secret', 'https://ex.bj/api', params, attendue), true);
  assert.equal(signatureValide('secret', 'https://ex.bj/api', { ...params, Body: 'NON' }, attendue), false);
  assert.equal(signatureValide('autre', 'https://ex.bj/api', params, attendue), false);
  assert.equal(signatureValide('secret', 'https://ex.bj/api', params, null), false);
});

test('envoi Twilio : requete formee, erreurs rapportees', async () => {
  let appel;
  const ok = async (url, init) => {
    appel = { url, init };
    return new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 });
  };
  const r = await envoyerTwilio({ sid: 'AC1', token: 't' }, { canal: 'whatsapp', de: '+1555', a: '+229011', texte: 'Bonjour' }, ok);
  assert.deepEqual(r, { ok: true, ref: 'SM123' });
  assert.match(appel.url, /Accounts\/AC1\/Messages\.json$/);
  assert.equal(appel.init.body.get('To'), 'whatsapp:+229011');
  assert.equal(appel.init.headers.Authorization, `Basic ${Buffer.from('AC1:t').toString('base64')}`);
  const ko = async () => new Response(JSON.stringify({ code: 21211, message: 'Invalid To' }), { status: 400 });
  assert.deepEqual(await envoyerTwilio({ sid: 'AC1', token: 't' }, { canal: 'sms', de: '+1', a: 'x', texte: 'y' }, ko), { ok: false, erreur: 'Twilio 400 (21211) : Invalid To' });
  const panne = async () => { throw new Error('ECONNRESET'); };
  assert.match((await envoyerTwilio({ sid: 'AC1', token: 't' }, { canal: 'sms', de: '+1', a: 'x', texte: 'y' }, panne)).erreur, /injoignable/);
});
