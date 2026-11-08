import Link from 'next/link';
import { requete } from '@/lib/db';
import { date, periode } from '@/lib/format';
import { exigerClient } from '@/lib/client/session';
import { ETAPES_CLIENT, etapeClient } from '@/lib/client/regles';
import { InviterInstallation } from '@/components/ApplicationInstallable';

// page du meme segment que le layout de l'espace : son modele de titre ne s'applique pas ici
export const metadata = { title: { absolute: 'Espace client PROXIMA' } };

const TONS = {
  neutre: 'bg-papier text-encre-douce ring-1 ring-trait',
  info: 'bg-marque-pale text-marque-fonce',
  alerte: 'bg-alerte-pale text-alerte',
  ok: 'bg-ok-pale text-ok',
  eteint: 'bg-trait/60 text-encre-douce',
};

/** Missions de l'entreprise cliente, de la preparation au rapport. */
export default async function MissionsClient() {
  const k = await exigerClient();
  const missions = await requete<{ id: string; reference: string; titre: string; statut: string; date_debut: string | null; date_fin: string | null; zone: string | null; rapport_transmis_le: Date | null; satisfaction_note: number | null }>(
    `SELECT id, reference, titre, statut, date_debut, date_fin, zone, rapport_transmis_le, satisfaction_note
       FROM mission WHERE client_id = $1 ORDER BY coalesce(date_debut, cree_le::date) DESC`,
    [k.client_id],
  );
  const enCours = missions.filter((m) => !['rapport', 'annulee'].includes(etapeClient(m.statut)));
  const terminees = missions.filter((m) => etapeClient(m.statut) === 'rapport');
  const aNoter = terminees.filter((m) => m.satisfaction_note === null).length;

  return (
    <div className="space-y-5">
      <InviterInstallation />
      {aNoter > 0 && (
        <p className="rounded-xl border border-accent/40 bg-alerte-pale px-4 py-3 text-sm text-alerte">
          {aNoter} rapport{aNoter > 1 ? 's' : ''} en attente de votre avis : il nous aide à améliorer nos missions.
        </p>
      )}
      <Liste titre={`En cours (${enCours.length})`} missions={enCours} vide="Aucune mission en cours." />
      <Liste titre={`Rapports disponibles (${terminees.length})`} missions={terminees} vide="Les rapports de vos missions apparaîtront ici." />
    </div>
  );
}

function Liste({ titre, missions, vide }: { titre: string; missions: { id: string; reference: string; titre: string; statut: string; date_debut: string | null; date_fin: string | null; zone: string | null; rapport_transmis_le: Date | null; satisfaction_note: number | null }[]; vide: string }) {
  return (
    <section className="carte p-5">
      <h2 className="mb-2 font-bold">{titre}</h2>
      {missions.length === 0 ? (
        <p className="text-sm text-encre-douce">{vide}</p>
      ) : (
        <ul className="divide-y divide-trait">
          {missions.map((m) => {
            const e = ETAPES_CLIENT[etapeClient(m.statut)];
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/client/missions/${m.id}`} className="min-w-0">
                  <span className="font-medium text-marque-fonce hover:underline">{m.titre}</span>
                  <span className="block text-xs text-encre-douce">
                    <span className="font-mono">{m.reference}</span> · {periode(m.date_debut, m.date_fin)}{m.zone && ` · ${m.zone}`}
                    {m.rapport_transmis_le && ` · rapport du ${date(m.rapport_transmis_le)}`}
                  </span>
                </Link>
                <span className={`puce ${TONS[e.ton]}`}>{e.libelle}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
