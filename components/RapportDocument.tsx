import { requete } from '@/lib/db';
import { date, dateHeure, periode, pourcentage } from '@/lib/format';
import { equipe, type Affectation } from '@/lib/missions/regles';
import { libelleCategorie } from '@/lib/referentiel';
import { GRAVITES, RESULTATS_CONTRE_APPEL, RESULTATS_CONTROLE, tauxRejet, TYPES_PREUVE, type Gravite, type TypePreuve } from '@/lib/preuves/regles';

const PHOTOS_MAX = 12;

/**
 * Document du rapport de mission remis au client (cahier des charges 5.7) :
 * resultats, preuves, indicateurs convenus. Le meme composant sert a
 * l'equipe (apercu, impression) et a l'espace client (phase 4). Aucune
 * donnee personnelle des intervenants n'y figure.
 *
 * `prefixeFichiers` : route qui sert les photos selon qui regarde
 * (/fichiers pour l'equipe, /client/fichiers pour le client).
 */
export async function RapportDocument({
  m,
  prefixeFichiers,
  auteurParDefaut,
}: {
  m: Record<string, any>;
  prefixeFichiers: string;
  auteurParDefaut: string | null;
}) {
  const id = m.id as string;
  const [indicateurs, affectations, preuves, controles, incidents, photos, auteur] = await Promise.all([
    requete<{ libelle: string; cible: string | null; resultat: string | null }>(
      'SELECT libelle, cible, resultat FROM mission_indicateur WHERE mission_id = $1 ORDER BY ordre',
      [id],
    ),
    requete<Affectation>('SELECT id, role, reponse, presence, remplace_affectation_id, proposee_le FROM affectation WHERE mission_id = $1', [id]),
    requete<{ type: TypePreuve; statut: string; n: number; contre_appels_confirmes: number }>(
      `SELECT type, statut, count(*)::int AS n,
              count(*) FILTER (WHERE type = 'contre_appel' AND donnees->>'resultat' = 'confirme')::int AS contre_appels_confirmes
         FROM preuve WHERE mission_id = $1 GROUP BY type, statut`,
      [id],
    ),
    requete<{ type: string; resultat: keyof typeof RESULTATS_CONTROLE; commentaire: string | null; realise_le: Date }>(
      'SELECT type, resultat, commentaire, realise_le FROM controle WHERE mission_id = $1 ORDER BY realise_le',
      [id],
    ),
    requete<{ description: string; gravite: Gravite; resolution: string | null; declare_le: Date }>(
      'SELECT description, gravite, resolution, declare_le FROM incident WHERE mission_id = $1 ORDER BY declare_le',
      [id],
    ),
    // seules les photos validees, donc prises avec l'accord des personnes visibles
    requete<{ id: string; description: string | null }>(
      `SELECT f.id, p.description FROM fichier f JOIN preuve p ON p.id = f.preuve_id
        WHERE p.mission_id = $1 AND p.statut = 'validee' AND p.type = 'photo' AND f.type_mime LIKE 'image/%'
        ORDER BY p.realisee_le NULLS LAST, f.cree_le LIMIT ${PHOTOS_MAX}`,
      [id],
    ),
    requete<{ nom_complet: string }>('SELECT nom_complet FROM utilisateur WHERE id = $1', [m.rapport_transmis_par ?? m.responsable_id ?? auteurParDefaut]),
  ]);

  const e = equipe(affectations);
  const titulairesPointes = affectations.filter((a) => a.role === 'titulaire' && a.presence);
  const presents = titulairesPointes.filter((a) => a.presence !== 'absent').length;
  const remplacements = affectations.filter((a) => a.remplace_affectation_id).length;
  const validees = (t: TypePreuve) => preuves.filter((p) => p.type === t && p.statut === 'validee').reduce((s, p) => s + p.n, 0);
  const bilan = {
    validees: preuves.filter((p) => p.statut === 'validee').reduce((s, p) => s + p.n, 0),
    rejetees: preuves.filter((p) => p.statut === 'rejetee').reduce((s, p) => s + p.n, 0),
  };
  const rejet = tauxRejet(bilan);
  const contreAppels = validees('contre_appel');
  const confirmes = preuves.filter((p) => p.statut === 'validee').reduce((s, p) => s + p.contre_appels_confirmes, 0);

  return (
      <article className="document carte space-y-6 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-trait pb-5">
          <div>
            <div className="text-[15px] font-extrabold tracking-tight">PROXIMA <span className="text-marque">CONNECT</span></div>
            <h2 className="mt-3 text-2xl font-bold">Rapport de mission</h2>
            <p className="text-lg">{m.titre}</p>
          </div>
          <dl className="text-right text-sm">
            <dt className="text-xs text-encre-douce">Client</dt>
            <dd className="font-semibold">{m.raison_sociale}</dd>
            <dt className="mt-2 text-xs text-encre-douce">Référence</dt>
            <dd className="font-mono">{m.reference}</dd>
            <dt className="mt-2 text-xs text-encre-douce">Date du rapport</dt>
            <dd>{date(m.rapport_transmis_le ?? new Date())}</dd>
          </dl>
        </header>

        <section>
          <h3 className="mb-2 font-bold">La mission</h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Ligne k="Type" v={m.type_mission ?? libelleCategorie(m.categorie)} />
            <Ligne k="Période" v={periode(m.date_debut, m.date_fin)} />
            <Ligne k="Zone" v={m.zone} />
            <Ligne k="Horaires" v={m.horaires} />
          </dl>
          {m.objectifs && <p className="mt-3 whitespace-pre-line text-sm"><strong>Objectifs.</strong> {m.objectifs}</p>}
          {m.livrables && <p className="mt-1 whitespace-pre-line text-sm"><strong>Livrables attendus.</strong> {m.livrables}</p>}
        </section>

        {m.rapport_synthese ? (
          <section>
            <h3 className="mb-2 font-bold">Synthèse</h3>
            <p className="whitespace-pre-line text-sm">{m.rapport_synthese}</p>
          </section>
        ) : (
          <p className="non-imprime rounded-lg border border-dashed border-trait px-3 py-2 text-sm text-encre-douce">Synthèse à rédiger avant la transmission.</p>
        )}

        <section>
          <h3 className="mb-2 font-bold">Indicateurs convenus</h3>
          {indicateurs.length === 0 ? (
            <p className="text-sm text-encre-douce">Aucun indicateur convenu n’a été renseigné.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-trait text-left text-xs uppercase tracking-wide text-encre-douce">
                <tr>
                  <th className="py-2 pr-3">Indicateur</th>
                  <th className="py-2 pr-3">Objectif</th>
                  <th className="py-2">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-trait">
                {indicateurs.map((i) => (
                  <tr key={i.libelle}>
                    <td className="py-2 pr-3">{i.libelle}</td>
                    <td className="py-2 pr-3">{i.cible ?? '-'}</td>
                    <td className="py-2 font-semibold">{i.resultat ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-bold">Exécution</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Chiffre libelle="Intervenants mobilisés" valeur={`${e.engages.length} / ${m.nb_profils_requis}`} />
            <Chiffre libelle="Taux de présence" valeur={titulairesPointes.length ? `${Math.round((presents / titulairesPointes.length) * 100)} %` : '-'} />
            <Chiffre libelle="Remplacements" valeur={String(remplacements)} />
            <Chiffre libelle="Briefing" valeur={m.briefing_le ? date(m.briefing_le) : '-'} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-bold">Preuves et contrôle des données</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(TYPES_PREUVE) as TypePreuve[]).filter((t) => validees(t) > 0).map((t) => (
              <Chiffre key={t} libelle={TYPES_PREUVE[t].libelle} valeur={String(validees(t))} />
            ))}
            <Chiffre libelle="Données rejetées" valeur={rejet === null ? '-' : pourcentage(rejet)} />
          </div>
          {contreAppels > 0 && (
            <p className="mt-2 text-sm">
              Contre-appels : {confirmes} {RESULTATS_CONTRE_APPEL.confirme.toLowerCase()} sur {contreAppels}.
            </p>
          )}
          <p className="mt-2 text-xs text-encre-douce">
            Seules les preuves validées par PROXIMA sont comptées. Chaque donnée remontée est contrôlée, et rejetée avec un motif si elle n’est pas fiable.
          </p>
          {controles.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {controles.map((c, i) => (
                <li key={i}>
                  <strong>{c.type}</strong> ({date(c.realise_le)}) : {RESULTATS_CONTROLE[c.resultat]}
                  {c.commentaire && <span className="text-encre-douce">, {c.commentaire}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {incidents.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold">Incidents</h3>
            <ul className="space-y-2 text-sm">
              {incidents.map((n, i) => (
                <li key={i}>
                  <strong>{GRAVITES[n.gravite]}</strong>, le {date(n.declare_le)} : {n.description}
                  <div className="text-encre-douce">{n.resolution ? `Résolution : ${n.resolution}` : 'En cours de traitement.'}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {photos.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold">Photos de terrain</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <figure key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- fichier servi apres controle des droits */}
                  <img src={`${prefixeFichiers}/${p.id}`} alt={p.description ?? 'Photo de terrain'} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                  {p.description && <figcaption className="mt-1 text-xs text-encre-douce">{p.description}</figcaption>}
                </figure>
              ))}
            </div>
            <p className="mt-2 text-xs text-encre-douce">Photos prises avec l’accord des personnes visibles.</p>
          </section>
        )}

        <footer className="border-t border-trait pt-4 text-xs text-encre-douce">
          Rapport établi par {auteur[0]?.nom_complet ?? 'PROXIMA'} pour PROXIMA CONNECT
          {m.rapport_transmis_le ? `, transmis le ${dateHeure(m.rapport_transmis_le)}` : ' (document de travail, non transmis)'}.
        </footer>
      </article>
  );
}

function Ligne({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-trait/60 py-1">
      <dt className="text-encre-douce">{k}</dt>
      <dd className="text-right">{v || '-'}</dd>
    </div>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-lg bg-papier p-3">
      <div className="text-xs text-encre-douce">{libelle}</div>
      <div className="text-xl font-bold tabular-nums">{valeur}</div>
    </div>
  );
}
