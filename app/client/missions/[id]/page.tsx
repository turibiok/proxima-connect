import Link from 'next/link';
import { notFound } from 'next/navigation';
import { une } from '@/lib/db';
import { date, periode } from '@/lib/format';
import { exigerClient } from '@/lib/client/session';
import { ETAPES_CLIENT, etapeClient } from '@/lib/client/regles';
import { NOTES_SATISFACTION } from '@/lib/reporting/regles';
import { RapportDocument } from '@/components/RapportDocument';
import { Imprimer } from '@/app/missions/[id]/rapport/Actions';
import { AvisClient } from './Avis';

export const metadata = { title: 'Mission' };

/**
 * Une mission vue par le client : son avancement, puis, une fois transmis,
 * le rapport complet (le meme document que celui prepare par l'equipe) et
 * la possibilite de donner son avis.
 */
export default async function MissionClient({ params }: { params: Promise<{ id: string }> }) {
  const k = await exigerClient();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // une entreprise ne voit que ses missions
  const m = await une<Record<string, any>>(
    `SELECT m.*, (SELECT count(*) FROM affectation a WHERE a.mission_id = m.id AND a.role = 'titulaire' AND a.reponse = 'accepte'
                    AND NOT EXISTS (SELECT 1 FROM affectation r WHERE r.remplace_affectation_id = a.id))::int AS engages
       FROM mission m WHERE m.id = $1 AND m.client_id = $2`,
    [id, k.client_id],
  );
  if (!m) notFound();
  const etape = etapeClient(m.statut);

  return (
    <div className="space-y-5">
      <div className="non-imprime flex flex-wrap items-center justify-between gap-3">
        <Link href="/client" className="text-sm text-marque hover:underline">← Missions</Link>
        {m.rapport_transmis_le && <Imprimer />}
      </div>

      {!m.rapport_transmis_le ? (
        <section className="carte space-y-3 p-5">
          <h1 className="text-xl font-bold">{m.titre}</h1>
          <p className="text-sm text-encre-douce"><span className="font-mono">{m.reference}</span> · {periode(m.date_debut, m.date_fin)}{m.zone && ` · ${m.zone}`}</p>
          <p className="text-sm"><strong>{ETAPES_CLIENT[etape].libelle}</strong>{ETAPES_CLIENT[etape].aide && ` : ${ETAPES_CLIENT[etape].aide}`}</p>
          {etape !== 'annulee' && <p className="text-sm">Équipe mobilisée : {m.engages} intervenant{m.engages > 1 ? 's' : ''} sur {m.nb_profils_requis}.</p>}
          <p className="text-xs text-encre-douce">Le rapport de mission apparaîtra ici dès sa transmission.</p>
        </section>
      ) : (
        <>
          <section className="non-imprime carte p-5">
            <h2 className="font-bold">Votre avis sur cette mission</h2>
            {m.satisfaction_note ? (
              <p className="mt-1 text-sm">
                <strong>{m.satisfaction_note}/5</strong> · {NOTES_SATISFACTION[m.satisfaction_note]}
                {m.satisfaction_commentaire && <> : « {m.satisfaction_commentaire} »</>}
                <span className="block text-xs text-encre-douce">le {date(m.satisfaction_le)}{m.satisfaction_source === 'equipe' && ', recueilli par l’équipe PROXIMA'}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-encre-douce">Comment s’est passée cette mission ? Votre note nous aide à progresser.</p>
            )}
            <AvisClient missionId={id} note={m.satisfaction_note} />
          </section>
          <RapportDocument m={{ ...m, raison_sociale: k.raison_sociale }} prefixeFichiers="/client/fichiers" auteurParDefaut={null} />
        </>
      )}
    </div>
  );
}
