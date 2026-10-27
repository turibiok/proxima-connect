import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { LIBELLES_ACTIONS } from '@/lib/journal';
import { date, dateHeure, periode } from '@/lib/format';
import { formaterFCFA, type StatutBrief } from '@/lib/clients/regles';
import { CATEGORIES_MISSIONS, libelleCategorie } from '@/lib/referentiel';
import { PuceBrief } from '@/components/Statut';
import { Abandon, Reouverture } from './Actions';

export const metadata = { title: 'Brief' };

export default async function DetailBrief({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('client:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const b = await une<Record<string, any>>(
    `SELECT b.*, c.raison_sociale, c.statut_commercial, u.nom_complet AS saisi_par_nom
       FROM brief b JOIN client c ON c.id = b.client_id
       LEFT JOIN utilisateur u ON u.id = b.saisi_par
      WHERE b.id = $1`,
    [id],
  );
  if (!b) notFound();

  const [missions, historique, profilsCompatibles] = await Promise.all([
    requete<{ id: string; reference: string; titre: string }>('SELECT id, reference, titre FROM mission WHERE brief_id = $1', [id]),
    requete<{ action: string; details: any; cree_le: Date; auteur: string | null }>(
      `SELECT j.action, j.details, j.cree_le, u.nom_complet AS auteur
         FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.entite = 'brief' AND j.entite_id = $1 ORDER BY j.cree_le DESC`,
      [id],
    ),
    // Premier apercu du vivier : profils verifies ou actifs qui acceptent ce
    // type de mission. La selection fine (zone, disponibilite, score) vient
    // avec le module 5.3.
    b.categorie
      ? une<{ n: number }>(
          `SELECT count(*)::int AS n FROM intervenant WHERE statut IN ('verifie', 'actif') AND $1 = ANY (categories_missions)`,
          [b.categorie],
        )
      : Promise.resolve(undefined),
  ]);

  const statut = b.statut as StatutBrief;
  const modifiable = ctx.peut('client:modifier') && statut === 'recu';
  const categorie = CATEGORIES_MISSIONS.find((c) => c.code === b.categorie);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/briefs" className="text-sm text-marque hover:underline">← Briefs</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{b.type_mission ?? (categorie ? `${categorie.libelle} (autre)` : 'Brief')}</h1>
            <PuceBrief statut={statut} />
          </div>
          <p className="mt-1 text-sm text-encre-douce">
            <Link href={`/clients/${b.client_id}`} className="font-medium text-marque hover:underline">{b.raison_sociale}</Link>
            {' · '}reçu le {date(b.recu_le)}
            {b.saisi_par_nom && ` par ${b.saisi_par_nom}`}
            {categorie && ` · ${categorie.libelle}`}
          </p>
        </div>
        {modifiable && (
          <div className="flex gap-2">
            <Link href={`/briefs/${id}/modifier`} className="btn">Modifier</Link>
            {ctx.peut('mission:modifier') && (
              <Link href={`/missions/nouvelle?brief=${id}`} className="btn-primaire">Créer la mission</Link>
            )}
          </div>
        )}
      </div>

      {statut === 'abandonne' && (
        <div className="rounded-xl border border-trait bg-white px-4 py-3 text-sm">
          <strong>Abandonné :</strong> {b.motif_abandon}
          {ctx.peut('client:modifier') && <Reouverture id={id} />}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-5 md:col-span-2">
          <section className="carte p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Objectif</h2>
            <p className="whitespace-pre-line">{b.objectif}</p>
            {b.livrables && (
              <>
                <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-encre-douce">Livrables attendus</h2>
                <p className="whitespace-pre-line">{b.livrables}</p>
              </>
            )}
          </section>

          <section className="carte p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-encre-douce">Cadre</h2>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              {(
                [
                  ['Zone', b.zone],
                  ['Période', periode(b.date_debut, b.date_fin)],
                  ['Horaires', b.horaires],
                  ['Durée', b.duree],
                  ['Effectif', b.nb_profils ? `${b.nb_profils} personne${b.nb_profils > 1 ? 's' : ''}` : null],
                  ['Compétences', b.competences.join(', ')],
                  ['Budget client', b.budget_fcfa !== null ? formaterFCFA(b.budget_fcfa) : null],
                  ['Budget par personne', b.budget_fcfa && b.nb_profils ? `${formaterFCFA(b.budget_fcfa / b.nb_profils)} (budget ÷ effectif, avant marge)` : null],
                ] as [string, string | null][]
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-encre-douce">{k}</dt>
                  <dd className="mb-1 sm:mb-0">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="space-y-5">
          {b.categorie && (
            <section className="carte p-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Vivier</h2>
              <p className="text-3xl font-bold tabular-nums">{profilsCompatibles?.n ?? 0}</p>
              <p className="text-sm text-encre-douce">
                profils vérifiés ou actifs acceptent les missions « {libelleCategorie(b.categorie)} »
                {b.nb_profils ? ` pour ${b.nb_profils} demandé${b.nb_profils > 1 ? 's' : ''}` : ''}.
              </p>
              <Link href={`/intervenants?categorie=${b.categorie}`} className="mt-2 inline-block text-sm text-marque hover:underline">
                Voir ces profils →
              </Link>
            </section>
          )}

          {missions.length > 0 && (
            <section className="carte p-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Mission</h2>
              {missions.map((m) => (
                <Link key={m.id} href={`/missions/${m.id}`} className="block text-sm text-marque hover:underline">
                  <span className="font-mono text-xs">{m.reference}</span> {m.titre}
                </Link>
              ))}
            </section>
          )}

          {modifiable && (
            <section className="carte p-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Abandonner</h2>
              <Abandon id={id} />
            </section>
          )}

          <section className="carte p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Historique</h2>
            <ol className="space-y-2 text-sm">
              {historique.map((h, i) => (
                <li key={i}>
                  <div className="font-medium">
                    {LIBELLES_ACTIONS[h.action] ?? h.action}
                    {h.action === 'brief_statut' && (h.details?.vers === 'abandonne' ? ' : abandonné' : ' : rouvert')}
                  </div>
                  <div className="text-xs text-encre-douce">{dateHeure(h.cree_le)} · {h.auteur ?? '—'}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
