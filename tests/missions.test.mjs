import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chevauchement,
  compatibilite,
  economie,
  equipe,
  etapesVoisines,
  joursMission,
  lieux,
  messageProposition,
  refusTransition,
  remplacable,
} from '../lib/missions/regles.ts';

const etat = { engages: 2, requis: 3, briefing: true, presencesManquantes: 0 };

test('statuts : une etape a la fois, avec ses conditions', () => {
  assert.equal(refusTransition('brief_recu', 'selection', etat), null);
  assert.match(refusTransition('selection', 'execution', etat), /une à une/);
  assert.match(refusTransition('selection', 'preparation', { ...etat, engages: 0 }), /accepté/);
  assert.match(refusTransition('preparation', 'execution', { ...etat, briefing: false }), /briefing/);
  assert.match(refusTransition('execution', 'preuves_collectees', { ...etat, presencesManquantes: 2 }), /2 manquantes/);
  assert.equal(refusTransition('execution', 'preuves_collectees', etat), null);
});

test('statuts : rapport transmis exige, retour arriere permis sauf vers le brief', () => {
  assert.match(refusTransition('controlee', 'rapport_transmis', etat), /transmission au client/);
  assert.equal(refusTransition('controlee', 'rapport_transmis', { ...etat, rapportTransmis: true }), null);
  assert.match(refusTransition('preuves_collectees', 'controlee', etat), /Aucune preuve validée/);
  assert.equal(
    refusTransition('preuves_collectees', 'controlee', { ...etat, bilan: { validees: 3, enAttente: 0, rejetees: 1, incidentsBloquants: 0 } }),
    null,
  );
  assert.equal(refusTransition('execution', 'preparation', etat), null);
  assert.match(refusTransition('selection', 'brief_recu', etat), /brief/);
});

test('statuts : annulation motivee, mission close intouchable', () => {
  assert.match(refusTransition('execution', 'annulee', etat, ' '), /motif/);
  assert.equal(refusTransition('execution', 'annulee', etat, 'Client a reporté'), null);
  assert.match(refusTransition('annulee', 'selection', etat), /close/);
  assert.deepEqual(etapesVoisines('selection'), { suivante: 'preparation', precedente: null });
  assert.deepEqual(etapesVoisines('execution'), { suivante: 'preuves_collectees', precedente: 'preparation' });
});

const aff = (id, role, reponse, presence = null, remplace = null, proposee = '2026-11-01') => ({
  id, role, reponse, presence, remplace_affectation_id: remplace, proposee_le: proposee,
});

test('equipe : un titulaire remplace ne compte plus, son remplacant si', () => {
  const affs = [
    aff('a', 'titulaire', 'accepte', 'present'),
    aff('b', 'titulaire', 'accepte', 'absent'),
    aff('c', 'titulaire', 'accepte', null, 'b'), // remplacant promu
    aff('d', 'remplacant', 'accepte'),
    aff('e', 'titulaire', 'en_attente'),
    aff('f', 'titulaire', 'en_attente', null, null, null),
  ];
  const e = equipe(affs);
  assert.deepEqual(e.engages.map((x) => x.id), ['a', 'c']);
  assert.deepEqual(e.reserve.map((x) => x.id), ['d']);
  assert.deepEqual(e.enAttente.map((x) => x.id), ['e']);
  assert.deepEqual(e.aProposer.map((x) => x.id), ['f']);
  assert.equal(e.presencesManquantes, 1);
  assert.equal(e.tauxPresence, 0.5);
  assert.equal(remplacable(affs[1], e.remplaces), false); // deja remplace
  assert.equal(remplacable(aff('g', 'titulaire', 'refuse'), e.remplaces), true);
});

test('jours : semaine couverte, limite a 7 jours, dates absentes', () => {
  assert.deepEqual(joursMission('2026-11-14', '2026-11-15'), ['dim', 'sam']); // samedi-dimanche
  assert.equal(joursMission('2026-11-01', '2026-11-30').length, 7);
  assert.equal(joursMission(null, null), null);
});

test('chevauchement des periodes', () => {
  assert.equal(chevauchement({ debut: '2026-11-14', fin: '2026-11-21' }, { debut: '2026-11-21', fin: null }), true);
  assert.equal(chevauchement({ debut: '2026-11-14', fin: '2026-11-15' }, { debut: '2026-11-16', fin: '2026-11-20' }), false);
  assert.equal(chevauchement({ debut: null, fin: null }, { debut: '2026-11-16', fin: null }), false);
});

test('lieux : decoupage et accents', () => {
  assert.deepEqual(lieux('Cotonou : Dantokpa, Ganhi et Akpakpa'), ['cotonou', 'dantokpa', 'ganhi', 'akpakpa']);
  assert.deepEqual(lieux('Sèmè-Podji'), ['seme-podji']);
});

const besoin = { categorie: 'enquetes', zone: 'Cotonou : Fidjrossè', jours: ['sam'], competences: ['Saisie sur smartphone'], score_minimum: 60 };
const profil = {
  ville: 'Cotonou', quartier: 'Agla', zones: ['Fidjrosse'], categories_missions: ['enquetes'],
  jours_disponibles: ['sam', 'dim'], competences: ['saisie sur smartphone', 'Vente'], score: 80,
};

test('compatibilite : profil ideal', () => {
  const r = compatibilite(besoin, profil, false);
  assert.equal(r.eligible, true);
  assert.equal(r.points, 98);
});

test('compatibilite : bloquants', () => {
  assert.equal(compatibilite(besoin, { ...profil, categories_missions: ['distribution'] }, false).eligible, false);
  assert.equal(compatibilite(besoin, { ...profil, score: 50 }, false).eligible, false);
  assert.equal(compatibilite(besoin, profil, true).eligible, false);
  // un profil jamais note n'est pas exclu par le score minimum
  assert.equal(compatibilite(besoin, { ...profil, score: null }, false).eligible, true);
});

test('compatibilite : hors zone et indisponible abaissent le classement sans exclure', () => {
  const r = compatibilite(besoin, { ...profil, ville: 'Parakou', zones: [], jours_disponibles: ['lun'] }, false);
  assert.equal(r.eligible, true);
  assert.equal(r.points, 30 + 0 + 0 + 10 + 8);
});

test('economie : cout et marge', () => {
  assert.deepEqual(economie(1_500_000, 100_000, 10), { cout: 1_000_000, marge: 500_000, taux: 1 / 3 });
  assert.equal(economie(1_500_000, null, 10), null);
  assert.deepEqual(economie(null, 15_000, 4), { cout: 60_000, marge: null, taux: null });
});

test('proposition : conditions annoncees, texte court', () => {
  const m = messageProposition({
    prenom: 'Afi Mireille', titre: 'Relevés de prix', lieu: null, zone: 'Cotonou', date_debut: '2026-11-14',
    date_fin: '2026-11-15', horaires: '8 h à 13 h', remuneration: 15000, objectifs: 'x'.repeat(300), role: 'titulaire',
  });
  assert.match(m, /^Bonjour Afi,/);
  assert.match(m, /Rémunération : 15 000 FCFA/);
  assert.match(m, /Lieu : Cotonou/);
  assert.ok(m.length < 500);
  assert.match(messageProposition({ prenom: 'Koffi', titre: 'T', lieu: 'Siège', zone: null, date_debut: null, date_fin: null, horaires: null, remuneration: 0, objectifs: null, role: 'remplacant' }), /réserve/);
});

import { lireMission } from '../lib/missions/regles.ts';

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.append(k, v);
  return f;
}

test('formulaire mission : lecture et controles', () => {
  const ok = lireMission(formulaire({ titre: 'Relevés', type_mission: 'enquetes::Relevés de prix', nb_profils_requis: '10', remuneration_agent_fcfa: '15 000', competences: 'Fon, Fon, Vente' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.donnees.remuneration_agent_fcfa, 15000);
  assert.deepEqual(ok.donnees.competences, ['Fon', 'Vente']);
  const ko = lireMission(formulaire({ titre: '', type_mission: '', nb_profils_requis: '0', score_minimum: '120', date_fin: '2026-11-02' }));
  assert.equal(ko.ok, false);
  assert.deepEqual(Object.keys(ko.erreurs).sort(), ['date_debut', 'nb_profils_requis', 'score_minimum', 'titre', 'type_mission']);
});
