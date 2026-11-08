import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { dateHeure, pourcentage } from '@/lib/format';
import { chargerMission } from '@/lib/missions/donnees';
import {
  bloquant,
  estImage,
  GRAVITES,
  lienCarte,
  RESULTATS_CONTRE_APPEL,
  RESULTATS_CONTROLE,
  restesAControler,
  STATUTS_PREUVE,
  tauxRejet,
  TYPES_PREUVE,
  type Gravite,
  type StatutPreuve,
  type TypePreuve,
} from '@/lib/preuves/regles';
import { PuceMission } from '@/components/Statut';
import { SaisiePreuve } from './Saisie';
import { NouveauControle, NouvelIncident, Resolution, StatutPreuve as ActionsPreuve } from './Controle';

export const metadata = { title: 'Preuves et contrôle' };

interface Preuve {
  id: string;
  type: TypePreuve;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  precision_m: number | null;
  donnees: Record<string, any> | null;
  statut: StatutPreuve;
  motif_rejet: string | null;
  realisee_le: Date | null;
  saisie_le: Date;
  intervenant: string | null;
  saisi_par: string | null;
  valide_par: string | null;
  validee_le: Date | null;
  fichiers: { id: string; nom: string; type_mime: string; taille: number }[];
}

const TON: Record<StatutPreuve, string> = {
  en_attente: 'bg-alerte-pale text-alerte',
  validee: 'bg-ok-pale text-ok',
  rejetee: 'bg-danger-pale text-danger',
};

export default async function Preuves({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statut?: string }>;
}) {
  const ctx = await exiger('mission:lire');
  const { id } = await params;
  const { statut: filtre } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();

  const filtreValide = filtre && filtre in STATUTS_PREUVE ? filtre : null;
  const [preuves, comptes, controles, incidents, equipe] = await Promise.all([
    requete<Preuve>(
      `SELECT p.id, p.type, p.description, p.latitude, p.longitude, p.precision_m, p.donnees, p.statut, p.motif_rejet,
              p.realisee_le, p.saisie_le, p.validee_le,
              i.nom || ' ' || i.prenoms AS intervenant, us.nom_complet AS saisi_par, uv.nom_complet AS valide_par,
              coalesce((SELECT json_agg(json_build_object('id', f.id, 'nom', f.nom, 'type_mime', f.type_mime, 'taille', f.taille) ORDER BY f.cree_le)
                          FROM fichier f WHERE f.preuve_id = p.id), '[]') AS fichiers
         FROM preuve p
         LEFT JOIN intervenant i ON i.id = p.intervenant_id
         LEFT JOIN utilisateur us ON us.id = p.saisie_par
         LEFT JOIN utilisateur uv ON uv.id = p.validee_par
        WHERE p.mission_id = $1 ${filtreValide ? 'AND p.statut = $2' : ''}
        ORDER BY (p.statut = 'en_attente') DESC, p.saisie_le DESC`,
      filtreValide ? [id, filtreValide] : [id],
    ),
    requete<{ statut: StatutPreuve; n: number }>('SELECT statut, count(*)::int AS n FROM preuve WHERE mission_id = $1 GROUP BY statut', [id]),
    requete<{ id: string; type: string; resultat: keyof typeof RESULTATS_CONTROLE; commentaire: string | null; realise_le: Date; auteur: string | null; intervenant: string | null }>(
      `SELECT c.id, c.type, c.resultat, c.commentaire, c.realise_le, u.nom_complet AS auteur, i.nom || ' ' || i.prenoms AS intervenant
         FROM controle c LEFT JOIN utilisateur u ON u.id = c.realise_par LEFT JOIN intervenant i ON i.id = c.intervenant_id
        WHERE c.mission_id = $1 ORDER BY c.realise_le DESC`,
      [id],
    ),
    requete<{ id: string; description: string; gravite: Gravite; resolution: string | null; resolu_le: Date | null; declare_le: Date; auteur: string | null; intervenant: string | null }>(
      `SELECT n.id, n.description, n.gravite, n.resolution, n.resolu_le, n.declare_le, u.nom_complet AS auteur, i.nom || ' ' || i.prenoms AS intervenant
         FROM incident n LEFT JOIN utilisateur u ON u.id = n.declare_par LEFT JOIN intervenant i ON i.id = n.intervenant_id
        WHERE n.mission_id = $1 ORDER BY (n.resolu_le IS NULL) DESC, n.declare_le DESC`,
      [id],
    ),
    requete<{ id: string; nom: string }>(
      `SELECT DISTINCT i.id, i.nom || ' ' || i.prenoms AS nom FROM affectation a JOIN intervenant i ON i.id = a.intervenant_id
        WHERE a.mission_id = $1 AND a.reponse = 'accepte' ORDER BY 2`,
      [id],
    ),
  ]);

  const n = (s: StatutPreuve) => comptes.find((c) => c.statut === s)?.n ?? 0;
  const bilan = {
    validees: n('validee'),
    enAttente: n('en_attente'),
    rejetees: n('rejetee'),
    incidentsBloquants: incidents.filter((i) => !i.resolu_le && bloquant(i.gravite)).length,
  };
  const rejet = tauxRejet(bilan);
  const restes = restesAControler(bilan);
  const modifiable = ctx.peut('mission:modifier');
  const saisie = modifiable && ['execution', 'preuves_collectees'].includes(m.statut);
  const suivi = modifiable && ['preparation', 'execution', 'preuves_collectees', 'controlee'].includes(m.statut);
  const total = bilan.validees + bilan.enAttente + bilan.rejetees;

  return (
    <div className="space-y-5">
      <Link href={`/missions/${id}`} className="text-sm text-marque hover:underline">← {m.reference} · {m.titre}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Preuves et contrôle terrain</h1>
        <PuceMission statut={m.statut} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Chiffre libelle="Preuves" valeur={String(total)} detail={`${bilan.validees} validée${bilan.validees > 1 ? 's' : ''}`} />
        <Chiffre libelle="À contrôler" valeur={String(bilan.enAttente)} alerte={bilan.enAttente > 0} />
        <Chiffre
          libelle="Données rejetées"
          valeur={rejet === null ? '-' : pourcentage(rejet)}
          detail="cible : moins de 5 %"
          alerte={rejet !== null && rejet >= 0.05}
        />
        <Chiffre libelle="Incidents ouverts" valeur={String(incidents.filter((i) => !i.resolu_le).length)} detail={bilan.incidentsBloquants ? `${bilan.incidentsBloquants} grave(s)` : 'aucun grave'} alerte={bilan.incidentsBloquants > 0} />
      </div>

      {m.statut === 'preuves_collectees' && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${restes.length ? 'border-alerte/30 bg-alerte-pale text-alerte' : 'border-ok/30 bg-ok-pale text-ok'}`}>
          {restes.length
            ? <>Avant de déclarer la mission contrôlée : {restes.join(' ')}</>
            : <>Tout est contrôlé. <Link href={`/missions/${id}`} className="font-semibold underline">Déclarer la mission contrôlée</Link> depuis la page de la mission.</>}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {saisie && (
            <section className="carte p-5">
              <h2 className="mb-3 font-bold">Ajouter une preuve</h2>
              <SaisiePreuve missionId={id} equipe={equipe} />
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={`/missions/${id}/preuves`} className={`rounded-full border px-3 py-1 ${!filtreValide ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
                Toutes <span className="text-encre-douce">{total}</span>
              </Link>
              {(Object.keys(STATUTS_PREUVE) as StatutPreuve[]).map((s) => (
                <Link key={s} href={`/missions/${id}/preuves?statut=${s}`} className={`rounded-full border px-3 py-1 ${filtreValide === s ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
                  {STATUTS_PREUVE[s]} <span className="text-encre-douce">{n(s)}</span>
                </Link>
              ))}
            </div>

            {preuves.length === 0 ? (
              <div className="carte p-8 text-center text-sm text-encre-douce">
                {total ? 'Aucune preuve dans cette catégorie.' : saisie ? 'Aucune preuve pour le moment : ajoutez la première ci-dessus.' : 'Aucune preuve. Elles se saisissent pendant l’exécution de la mission.'}
              </div>
            ) : (
              preuves.map((p) => (
                <article key={p.id} className="carte p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{TYPES_PREUVE[p.type].libelle}{p.intervenant && <span className="font-normal text-encre-douce"> · {p.intervenant}</span>}</h3>
                      <p className="text-xs text-encre-douce">
                        {p.realisee_le ? `Réalisée le ${dateHeure(p.realisee_le)} · ` : ''}saisie le {dateHeure(p.saisie_le)}{p.saisi_par && ` par ${p.saisi_par}`}
                      </p>
                    </div>
                    <span className={`puce ${TON[p.statut]}`}>{STATUTS_PREUVE[p.statut]}</span>
                  </div>

                  {p.description && <p className="mt-2 whitespace-pre-line text-sm">{p.description}</p>}
                  <Details p={p} />

                  {p.fichiers.some((f) => estImage(f.type_mime)) && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {p.fichiers.filter((f) => estImage(f.type_mime)).map((f) => (
                        <a key={f.id} href={`/fichiers/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-trait bg-papier">
                          {/* eslint-disable-next-line @next/next/no-img-element -- fichier servi par l'application, deja reduit */}
                          <img src={`/fichiers/${f.id}`} alt={f.nom} loading="lazy" className="aspect-square w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {p.fichiers.some((f) => !estImage(f.type_mime)) && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {p.fichiers.filter((f) => !estImage(f.type_mime)).map((f) => (
                        <li key={f.id}>
                          <a href={`/fichiers/${f.id}`} className="text-marque hover:underline">{f.nom}</a>{' '}
                          <span className="text-xs text-encre-douce">({Math.max(1, Math.round(f.taille / 1024))} Ko)</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {p.statut === 'rejetee' && <p className="mt-2 rounded-lg bg-danger-pale px-3 py-1.5 text-sm text-danger">Rejetée : {p.motif_rejet}</p>}
                  {p.statut !== 'en_attente' && p.valide_par && (
                    <p className="mt-1 text-xs text-encre-douce">Contrôlée par {p.valide_par}{p.validee_le && ` le ${dateHeure(p.validee_le)}`}</p>
                  )}
                  {saisie && <ActionsPreuve missionId={id} preuveId={p.id} statut={p.statut} />}
                </article>
              ))
            )}
          </section>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <section className="carte p-5">
            <h2 className="mb-3 font-bold">Incidents</h2>
            {incidents.length === 0 ? (
              <p className="mb-3 text-sm text-encre-douce">Aucun incident déclaré.</p>
            ) : (
              <ul className="mb-4 divide-y divide-trait">
                {incidents.map((i) => (
                  <li key={i.id} className="py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`puce ${bloquant(i.gravite) ? 'bg-danger-pale text-danger' : 'bg-alerte-pale text-alerte'}`}>{GRAVITES[i.gravite]}</span>
                      <span className={`text-xs ${i.resolu_le ? 'text-ok' : 'text-alerte'}`}>{i.resolu_le ? 'Résolu' : 'Ouvert'}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line">{i.description}</p>
                    <p className="text-xs text-encre-douce">{dateHeure(i.declare_le)} · {i.auteur ?? '-'}{i.intervenant && ` · ${i.intervenant}`}</p>
                    {i.resolution && <p className="mt-1 text-xs text-ok">Résolution : {i.resolution}</p>}
                    {!i.resolu_le && suivi && <Resolution missionId={id} incidentId={i.id} />}
                  </li>
                ))}
              </ul>
            )}
            {suivi && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-marque">Déclarer un incident</summary>
                <div className="mt-3"><NouvelIncident missionId={id} equipe={equipe} /></div>
              </details>
            )}
          </section>

          <section className="carte p-5">
            <h2 className="mb-3 font-bold">Contrôles qualité</h2>
            {controles.length === 0 ? (
              <p className="mb-3 text-sm text-encre-douce">Aucun contrôle enregistré.</p>
            ) : (
              <ul className="mb-4 divide-y divide-trait">
                {controles.map((c) => (
                  <li key={c.id} className="py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{c.type}</span>
                      <span className={`puce ${c.resultat === 'conforme' ? 'bg-ok-pale text-ok' : c.resultat === 'reserve' ? 'bg-alerte-pale text-alerte' : 'bg-danger-pale text-danger'}`}>
                        {RESULTATS_CONTROLE[c.resultat]}
                      </span>
                    </div>
                    {c.commentaire && <p className="mt-1 whitespace-pre-line">{c.commentaire}</p>}
                    <p className="text-xs text-encre-douce">{dateHeure(c.realise_le)} · {c.auteur ?? '-'}{c.intervenant && ` · ${c.intervenant}`}</p>
                  </li>
                ))}
              </ul>
            )}
            {suivi && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-marque">Enregistrer un contrôle</summary>
                <div className="mt-3"><NouveauControle missionId={id} equipe={equipe} /></div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Details({ p }: { p: Preuve }) {
  const d = p.donnees ?? {};
  return (
    <dl className="mt-2 space-y-0.5 text-sm">
      {p.latitude !== null && p.longitude !== null && (
        <div>
          <dt className="sr-only">Position</dt>
          <dd>
            Position :{' '}
            <a href={lienCarte(p.latitude, p.longitude)} target="_blank" rel="noreferrer" className="text-marque hover:underline">
              {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
            </a>
            {p.precision_m !== null && <span className="text-encre-douce"> ± {Math.round(p.precision_m)} m</span>}
            {d.hors_benin && <span className="ml-2 font-semibold text-danger">Hors du Bénin : à vérifier</span>}
          </dd>
        </div>
      )}
      {p.type === 'signature' && d.signataire && (
        <dd>Signée par <strong>{d.signataire}</strong>{d.qualite && `, ${d.qualite}`}</dd>
      )}
      {p.type === 'contre_appel' && (
        <dd>
          Appel à <strong>{d.appele}</strong>{d.telephone && ` (${d.telephone})`} :{' '}
          <span className={d.resultat === 'confirme' ? 'font-semibold text-ok' : 'font-semibold text-danger'}>
            {RESULTATS_CONTRE_APPEL[d.resultat as keyof typeof RESULTATS_CONTRE_APPEL] ?? d.resultat}
          </span>
        </dd>
      )}
      {typeof d.lignes === 'number' && <dd className="text-encre-douce">{d.lignes} ligne{d.lignes > 1 ? 's' : ''} de données importée{d.lignes > 1 ? 's' : ''}</dd>}
    </dl>
  );
}

function Chiffre({ libelle, valeur, detail, alerte }: { libelle: string; valeur: string; detail?: string; alerte?: boolean }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-encre-douce">{libelle}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${alerte ? 'text-alerte' : ''}`}>{valeur}</div>
      {detail && <div className="text-xs text-encre-douce">{detail}</div>}
    </div>
  );
}
