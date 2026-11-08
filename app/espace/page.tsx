import Link from 'next/link';
import { requete, une } from '@/lib/db';
import { date, dateHeure, periode } from '@/lib/format';
import { exigerIntervenant } from '@/lib/espace/session';
import { formaterFCFA } from '@/lib/clients/regles';
import { DELAI_PAIEMENT, MODES_PAIEMENT, type ModePaiement } from '@/lib/finances/regles';
import { STATUTS_PROFIL, type StatutProfil } from '@/lib/referentiel';
import { PuceStatut } from '@/components/Statut';

// page du meme segment que le layout de l'espace : son modele de titre ne s'applique pas ici
export const metadata = { title: { absolute: 'Mon espace PROXIMA' } };

const EXPLICATIONS: Record<StatutProfil, string> = {
  en_attente: 'Votre inscription est en cours de vérification : pièce d’identité, âge, téléphone et moyen de paiement.',
  verifie: 'Votre profil est vérifié : vous pouvez recevoir des propositions de mission.',
  actif: 'Votre profil est actif : vous recevez des propositions de mission.',
  suspendu: 'Votre profil est suspendu : vous ne recevez plus de propositions pour le moment. Contactez l’équipe PROXIMA pour en savoir plus.',
  inactif: '',
};

interface Mission {
  affectation_id: string;
  titre: string;
  type_mission: string | null;
  date_debut: string | null;
  date_fin: string | null;
  horaires: string | null;
  lieu: string | null;
  zone: string | null;
  objectifs: string | null;
  statut: string;
  role: 'titulaire' | 'remplacant';
  reponse: 'en_attente' | 'accepte' | 'refuse';
  proposee_le: Date | null;
  presence: 'present' | 'retard' | 'absent' | null;
  remuneration: number | null;
  briefing_le: Date | null;
  briefing_lieu: string | null;
  remplace: boolean;
}

/**
 * Accueil de l'espace intervenant. Ne montre que ce qui concerne la
 * personne connectee, et rien du client (nom, budget) : certaines missions,
 * comme les visites mystere, n'ont pas a le reveler.
 */
export default async function AccueilEspace() {
  const i = await exigerIntervenant();

  const [profil, missions, paiements] = await Promise.all([
    une<{ statut: StatutProfil; score: number | null }>('SELECT statut, score FROM intervenant WHERE id = $1', [i.id]),
    requete<Mission>(
      `SELECT a.id AS affectation_id, m.titre, m.type_mission, m.date_debut, m.date_fin, m.horaires, m.lieu, m.zone, m.objectifs, m.statut,
              a.role, a.reponse, a.proposee_le, a.presence, coalesce(a.remuneration_proposee_fcfa, m.remuneration_agent_fcfa) AS remuneration,
              m.briefing_le, m.briefing_lieu,
              EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id) AS remplace
         FROM affectation a JOIN mission m ON m.id = a.mission_id
        WHERE a.intervenant_id = $1 AND m.statut <> 'annulee' AND (a.proposee_le IS NOT NULL OR a.presence IS NOT NULL)
        ORDER BY m.date_debut DESC NULLS FIRST`,
      [i.id],
    ),
    requete<{ id: string; titre: string; montant_fcfa: number; statut: 'a_payer' | 'paye' | 'en_litige'; du_depuis: Date; paye_le: Date | null; mode: ModePaiement | null; reference_transaction: string | null }>(
      `SELECT p.id, m.titre, p.montant_fcfa, p.statut, p.du_depuis, p.paye_le, p.mode, p.reference_transaction
         FROM paiement_intervenant p JOIN mission m ON m.id = p.mission_id
        WHERE p.intervenant_id = $1 ORDER BY p.du_depuis DESC`,
      [i.id],
    ),
  ]);
  const statut = profil!.statut;

  const propositions = missions.filter((m) => m.reponse === 'en_attente' && m.proposee_le && ['selection', 'preparation', 'execution'].includes(m.statut));
  const aVenir = missions.filter(
    (m) => m.reponse === 'accepte' && !m.remplace && !m.presence && ['selection', 'preparation', 'execution'].includes(m.statut),
  );
  const realisees = missions.filter((m) => m.presence);

  return (
    <div className="space-y-5">
      <section className="carte p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PuceStatut statut={statut} />
          <Link href="/espace/score" className="text-right">
            <span className="block text-xs uppercase tracking-wide text-encre-douce">PROXIMA SCORE</span>
            <span className="text-3xl font-bold tabular-nums">{profil!.score === null ? '-' : Math.round(profil!.score)}</span>
            {profil!.score !== null && <span className="text-sm text-encre-douce"> / 100</span>}
          </Link>
        </div>
        <p className="mt-2 text-sm">{EXPLICATIONS[statut] || STATUTS_PROFIL[statut].libelle}</p>
      </section>

      {propositions.length > 0 && (
        <section className="carte border-l-4 border-l-accent p-5">
          <h2 className="mb-2 font-bold">Propositions en attente de votre réponse</h2>
          <ul className="space-y-4">
            {propositions.map((m) => (
              <li key={m.affectation_id}>
                <FicheMission m={m} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-encre-douce">Pour répondre, répondez OUI ou NON au message reçu, ou appelez l’équipe PROXIMA.</p>
        </section>
      )}

      <section className="carte p-5">
        <h2 className="mb-2 font-bold">Mes prochaines missions</h2>
        {aVenir.length === 0 ? (
          <p className="text-sm text-encre-douce">Aucune mission prévue pour le moment.</p>
        ) : (
          <ul className="space-y-4">
            {aVenir.map((m) => (
              <li key={m.affectation_id}>
                <FicheMission m={m} />
                {m.briefing_le && (
                  <p className="mt-1 text-sm"><strong>Briefing</strong> : {dateHeure(m.briefing_le)}{m.briefing_lieu && `, ${m.briefing_lieu}`}</p>
                )}
                {m.role === 'remplacant' && <p className="mt-1 text-xs text-encre-douce">Vous êtes en réserve : l’équipe vous appellera si un remplacement est nécessaire.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte p-5">
        <h2 className="mb-1 font-bold">Mes paiements</h2>
        <p className="mb-3 text-xs text-encre-douce">
          PROXIMA vous paie dans les {DELAI_PAIEMENT.cible} à {DELAI_PAIEMENT.limite} heures qui suivent la validation de la mission.
        </p>
        {paiements.length === 0 ? (
          <p className="text-sm text-encre-douce">Aucun paiement pour le moment.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {paiements.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="min-w-0">
                  {p.titre}
                  <span className="block text-xs text-encre-douce">
                    {p.statut === 'paye'
                      ? `Payé le ${dateHeure(p.paye_le!)}${p.mode ? ` par ${MODES_PAIEMENT[p.mode]}` : ''} · réf. ${p.reference_transaction}`
                      : p.statut === 'en_litige'
                        ? 'En cours de vérification : l’équipe PROXIMA revient vers vous.'
                        : `Mission validée le ${date(p.du_depuis)} : paiement en préparation.`}
                  </span>
                </span>
                <span className={`font-semibold tabular-nums ${p.statut === 'paye' ? 'text-ok' : ''}`}>{formaterFCFA(p.montant_fcfa)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte p-5">
        <h2 className="mb-2 font-bold">Missions réalisées ({realisees.length})</h2>
        {realisees.length === 0 ? (
          <p className="text-sm text-encre-douce">Vos missions terminées apparaîtront ici.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {realisees.map((m) => (
              <li key={m.affectation_id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{m.titre}<span className="block text-xs text-encre-douce">{periode(m.date_debut, m.date_fin)}</span></span>
                <span className={m.presence === 'absent' ? 'text-danger' : m.presence === 'retard' ? 'text-alerte' : 'text-ok'}>
                  {{ present: 'Présent', retard: 'En retard', absent: 'Absent' }[m.presence!]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FicheMission({ m }: { m: Mission }) {
  return (
    <div>
      <p className="font-semibold">{m.titre}</p>
      <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
        <Info k="Quand" v={periode(m.date_debut, m.date_fin)} />
        <Info k="Horaires" v={m.horaires} />
        <Info k="Lieu" v={m.lieu ?? m.zone} />
        <Info k="Rémunération" v={m.remuneration !== null ? formaterFCFA(m.remuneration) : null} />
      </dl>
      {m.objectifs && <p className="mt-1 text-sm text-encre-douce">{m.objectifs}</p>}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-encre-douce">{k} :</dt>
      <dd>{v || 'à préciser'}</dd>
    </div>
  );
}
