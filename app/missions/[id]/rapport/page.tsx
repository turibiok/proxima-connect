import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { date, dateHeure } from '@/lib/format';
import { chargerMission } from '@/lib/missions/donnees';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';
import { CANAUX_RAPPORT, NOTES_SATISFACTION, type CanalRapport } from '@/lib/reporting/regles';
import { versSaisieDateHeure } from '@/lib/finances/regles';
import { PuceMission } from '@/components/Statut';
import { RapportDocument } from '@/components/RapportDocument';
import { Imprimer, Preparation, Satisfaction, Transmission } from './Actions';

export const metadata = { title: 'Rapport de mission' };

/**
 * Rapport de mission destine au client (cahier des charges 5.7) : resultats,
 * preuves, indicateurs convenus. Imprimable et enregistrable en PDF depuis
 * le navigateur. Aucune donnee personnelle des intervenants n'y figure : le
 * client recoit des resultats, pas des fiches.
 */
export default async function Rapport({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('mission:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();

  const [indicateurs, contact] = await Promise.all([
    requete<{ libelle: string; cible: string | null; resultat: string | null }>(
      'SELECT libelle, cible, resultat FROM mission_indicateur WHERE mission_id = $1 ORDER BY ordre',
      [id],
    ),
    // destinataire propose par defaut : le contact du client
    requete<{ contact_email: string | null; contact_nom: string | null }>('SELECT contact_email, contact_nom FROM client WHERE id = $1', [m.client_id]),
  ]);

  const statut = m.statut as StatutMission;
  const preparable = ['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'].includes(statut);
  const modifiable = ctx.peut('mission:modifier') && preparable;
  const brouillon = !m.rapport_transmis_le;

  return (
    <div className="space-y-5">
      <div className="non-imprime space-y-4">
        <Link href={`/missions/${id}`} className="text-sm text-marque hover:underline">← {m.reference} {m.titre}</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Rapport client</h1>
            <PuceMission statut={statut} />
            {m.rapport_transmis_le ? (
              <span className="puce bg-ok-pale text-ok">Transmis le {date(m.rapport_transmis_le)}</span>
            ) : (
              <span className="puce bg-alerte-pale text-alerte">Pas encore transmis</span>
            )}
          </div>
          <Imprimer />
        </div>
        {!preparable && (
          <p className="rounded-lg bg-alerte-pale px-3 py-2 text-sm text-alerte">
            Le rapport se prépare une fois les preuves collectées (étape actuelle : {LIBELLES_STATUT_MISSION[statut].toLowerCase()}).
          </p>
        )}

        {/* ouvert tant que le rapport n'est pas transmis ; ne depend pas de ce qu'on enregistre, sinon il se refermerait a l'enregistrement */}
        {modifiable && (
          <details className="carte p-5" open={brouillon}>
            <summary className="cursor-pointer font-bold">Synthèse et indicateurs convenus</summary>
            <Preparation missionId={id} synthese={m.rapport_synthese ?? ''} indicateurs={indicateurs} />
          </details>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {ctx.peut('mission:modifier') && (
            <section className="carte p-5">
              <h2 className="font-bold">Transmission au client</h2>
              {m.rapport_transmis_le && (
                <p className="mt-1 text-sm text-encre-douce">
                  {CANAUX_RAPPORT[m.rapport_canal as CanalRapport]} à {m.rapport_destinataire}, le {dateHeure(m.rapport_transmis_le)}.
                </p>
              )}
              {['controlee', 'rapport_transmis', 'payee'].includes(statut) ? (
                <Transmission
                  missionId={id}
                  dejaTransmis={!!m.rapport_transmis_le}
                  destinataire={m.rapport_destinataire ?? contact[0]?.contact_email ?? contact[0]?.contact_nom ?? ''}
                  maintenant={versSaisieDateHeure(new Date())}
                />
              ) : (
                <p className="mt-2 text-sm text-encre-douce">Possible une fois la mission contrôlée : les données remises au client doivent être validées.</p>
              )}
            </section>
          )}
          <section className="carte p-5">
            <h2 className="font-bold">Avis du client</h2>
            {m.satisfaction_note ? (
              <p className="mt-1 text-sm">
                <strong>{m.satisfaction_note}/5</strong> · {NOTES_SATISFACTION[m.satisfaction_note]}
                {m.satisfaction_commentaire && <> : « {m.satisfaction_commentaire} »</>}
                <span className="block text-xs text-encre-douce">{m.satisfaction_source === 'client' ? 'donné par le client depuis son espace' : 'recueilli'} le {date(m.satisfaction_le)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-encre-douce">Pas encore recueilli. Cible : 85 % de clients satisfaits (4 ou 5 sur 5).</p>
            )}
            {m.rapport_transmis_le && (ctx.peut('mission:modifier') || ctx.peut('client:modifier')) ? (
              <Satisfaction missionId={id} note={m.satisfaction_note} />
            ) : (
              !m.rapport_transmis_le && <p className="mt-2 text-xs text-encre-douce">À recueillir après la transmission du rapport.</p>
            )}
          </section>
        </div>
        <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Aperçu du document remis au client</h2>
      </div>

      {/* ------------------------------------------------ le document */}
      <RapportDocument m={m} prefixeFichiers="/fichiers" auteurParDefaut={ctx.utilisateur.id} />
    </div>
  );
}

