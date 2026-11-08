import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerScore, evolution, lireEvaluation, noteSurCent, peutTrancher } from '../lib/score/regles.ts';

const POIDS = { ponctualite: 15, presence: 15, missions_realisees: 10, qualite: 15, consignes: 10, exactitude: 15, comportement: 10, client: 10 };
const toutes = (n) => ({ ponctualite: n, qualite: n, consignes: n, exactitude: n, comportement: n, client: n });

test('notes ramenees sur 100', () => {
  assert.equal(noteSurCent(1), 0);
  assert.equal(noteSurCent(3), 50);
  assert.equal(noteSurCent(5), 100);
});

test('profil neuf : pas de score', () => {
  const r = calculerScore({ poids: POIDS, evaluations: [], presence: { notees: 0, presentes: 0 }, missionsRealisees: 0 });
  assert.equal(r.score, null);
  assert.equal(r.detail.length, 8);
});

test('intervenant parfait et experimente : 100', () => {
  const r = calculerScore({ poids: POIDS, evaluations: [{ notes: toutes(5) }], presence: { notees: 12, presentes: 12 }, missionsRealisees: 12 });
  assert.equal(r.score, 100);
});

test('critere sans donnee : poids reparti, pas de penalite', () => {
  // pas d'avis client : les 90 points de poids restants font la moyenne
  const notes = { ...toutes(5), client: null };
  const r = calculerScore({ poids: POIDS, evaluations: [{ notes }], presence: { notees: 10, presentes: 10 }, missionsRealisees: 10 });
  assert.equal(r.score, 100);
  assert.equal(r.detail.find((l) => l.code === 'client').valeur, null);
});

test('debutant : bonnes notes, peu de missions', () => {
  const r = calculerScore({ poids: POIDS, evaluations: [{ notes: toutes(5) }], presence: { notees: 1, presentes: 1 }, missionsRealisees: 1 });
  // 90 points de poids a 100, 10 points a 10 % : 91
  assert.equal(r.score, 91);
});

test('absences : le taux de presence pese', () => {
  const r = calculerScore({ poids: POIDS, evaluations: [{ notes: toutes(4) }], presence: { notees: 4, presentes: 2 }, missionsRealisees: 2 });
  const presence = r.detail.find((l) => l.code === 'presence');
  assert.equal(presence.valeur, 50);
  assert.match(presence.base, /2 présences sur 4/);
  assert.ok(r.score < 75);
});

test('moyenne des evaluations par critere', () => {
  const r = calculerScore({
    poids: { qualite: 1 },
    evaluations: [{ notes: { qualite: 5 } }, { notes: { qualite: 3 } }],
    presence: { notees: 0, presentes: 0 },
    missionsRealisees: 0,
  });
  assert.equal(r.detail.find((l) => l.code === 'qualite').base, '4,0 / 5 sur 2 évaluations');
  assert.equal(r.score, 75);
});

test('poids tous nuls : pas de score', () => {
  const r = calculerScore({ poids: {}, evaluations: [{ notes: toutes(5) }], presence: { notees: 1, presentes: 1 }, missionsRealisees: 1 });
  assert.equal(r.score, null);
});

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.append(k, v);
  return f;
}

test('evaluation : cinq notes exigees, avis client facultatif', () => {
  const r = lireEvaluation(formulaire({ ponctualite: '4', qualite: '5', consignes: '4', exactitude: '3', comportement: '5' }));
  assert.equal(r.ok, true);
  assert.equal(r.notes.client, null);
  const ko = lireEvaluation(formulaire({ ponctualite: '6', qualite: '' }));
  assert.equal(ko.ok, false);
  assert.ok(ko.erreurs.ponctualite && ko.erreurs.qualite && ko.erreurs.comportement);
});

test('evaluation : une note de 1 ou 2 doit etre expliquee', () => {
  const champs = { ponctualite: '2', qualite: '4', consignes: '4', exactitude: '4', comportement: '4' };
  assert.ok(lireEvaluation(formulaire(champs)).erreurs.commentaire);
  assert.equal(lireEvaluation(formulaire({ ...champs, commentaire: 'Arrivé 45 min en retard' })).ok, true);
});

test('contestation : l evaluateur ne tranche pas, sauf administrateur', () => {
  assert.equal(peutTrancher({ evaluee_par: 'u1' }, { id: 'u1', role: 'mission' }), false);
  assert.equal(peutTrancher({ evaluee_par: 'u1' }, { id: 'u2', role: 'recrutement' }), true);
  assert.equal(peutTrancher({ evaluee_par: 'u1' }, { id: 'u1', role: 'admin' }), true);
});

test('evolution du score', () => {
  assert.equal(evolution([{ score: 78.4 }, { score: 75 }]), 3.4);
  assert.equal(evolution([{ score: 70 }]), null);
});
