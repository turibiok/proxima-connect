import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { LIBELLES_ACTIONS } from '@/lib/journal';
import { date, dateHeure, periode, pourcentage } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import { afficherTelephone, lienWhatsApp } from '@/lib/intervenants/regles';
import { chargerEquipe, chargerMission } from '@/lib/missions/donnees';
import {
  economie,
  equipe,
  ETAPES,
  etapesVoisines,
  LIBELLES_STATUT_MISSION,
  messageProposition,
  refusTransition,
  remplacable,
  type StatutMission,
} from '@/lib/missions/regles';
import { libelleCategorie } from '@/lib/referentiel';
import { tauxRejet } from '@/lib/preuves/regles';
import { PuceFacture, PuceMission, PucePaiement } from '@/components/Statut';
import { SQL_ETAT_FINANCIER } from '@/lib/finances/mission';
import { aujourdhuiBenin, delaiPaiement, libelleDuree, situationFacture, TYPES_FACTURE, type StatutFacture, type StatutPaiement, type TypeFacture } from '@/lib/finances/regles';
import { LigneEquipe, type VueLigne } from './Equipe';
import { Envoi } from '@/components/Envoi';
import { HistoriqueCommunications, SQL_COMMUNICATIONS, type LigneCommunication } from '@/components/Communications';
import { messageRappel } from '@/lib/communication/regles';
import { Briefing, ChangementEtape } from './Pilotage';

export const metadata = { title: 'Mission' };

/** timestamptz -> valeur d'un champ datetime-local, a l'heure du Benin (UTC+1 toute l'annee). */
const versSaisieLocale = (d: Date | null) => (d ? new Date(new Date(d).getTime() + 3_600_000).toISOString().slice(0, 16) : '');

export default async function Mission({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('mission:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();

  const finances = ctx.peut('finance:lire');
  const [lignes, historique, [bilan], paiements, factures, [etatFin], communications] = await Promise.all([
    chargerEquipe(id),
    requete<{ action: string; details: any; cree_le: Date; auteur: string | null }>(
      `SELECT j.action, j.details, j.cree_le, u.nom_complet AS auteur
         FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.entite = 'mission' AND j.entite_id = $1 ORDER BY j.cree_le DESC LIMIT 40`,
      [id],
    ),
    requete<{ validees: number; enAttente: number; rejetees: number; incidentsBloquants: number; incidentsOuverts: number }>(
      `SELECT count(*) FILTER (WHERE p.statut = 'validee')::int AS validees,
              count(*) FILTER (WHERE p.statut = 'en_attente')::int AS "enAttente",
              count(*) FILTER (WHERE p.statut = 'rejetee')::int AS rejetees,
              (SELECT count(*) FROM incident n WHERE n.mission_id = $1 AND n.resolu_le IS NULL AND n.gravite IN ('elevee', 'critique'))::int AS "incidentsBloquants",
              (SELECT count(*) FROM incident n WHERE n.mission_id = $1 AND n.resolu_le IS NULL)::int AS "incidentsOuverts"
         FROM preuve p WHERE p.mission_id = $1`,
      [id],
    ),
    finances
      ? requete<{ id: string; intervenant_id: string; nom: string; prenoms: string; montant_fcfa: number; statut: StatutPaiement; du_depuis: Date; paye_le: Date | null }>(
          `SELECT p.id, p.intervenant_id, i.nom, i.prenoms, p.montant_fcfa, p.statut, p.du_depuis, p.paye_le
             FROM paiement_intervenant p JOIN intervenant i ON i.id = p.intervenant_id WHERE p.mission_id = $1 ORDER BY i.nom`,
          [id],
        )
      : [],
    finances
      ? requete<{ id: string; numero: string; type: TypeFacture; montant_fcfa: number; montant_regle_fcfa: number; echeance_le: string | null; statut: StatutFacture }>(
          `SELECT id, numero, type, montant_fcfa, montant_regle_fcfa, echeance_le, statut FROM facture WHERE mission_id = $1 ORDER BY emise_le, numero`,
          [id],
        )
      : [],
    // l'etape « payee » depend des paiements et des factures, quel que soit le role qui consulte
    requete<{ paiementsOuverts: number; factures: number; nonSoldees: number }>(SQL_ETAT_FINANCIER, [id]),
    requete<LigneCommunication>(SQL_COMMUNICATIONS('mission'), [id]),
  ]);
  // dernier rappel envoye a chacun (module 5.8)
  const rappels = new Map<string, Date>();
  for (const c of communications) if (c.modele === 'rappel' && !rappels.has(c.intervenant_id)) rappels.set(c.intervenant_id, c.cree_le);

  const statut = m.statut as StatutMission;
  const e = equipe(lignes);
  const close = statut === 'annulee' || statut === 'payee';
  const modifiable = ctx.peut('mission:modifier') && !close;
  const composition = ['selection', 'preparation', 'execution'].includes(statut);
  const pointage = ['execution', 'preuves_collectees'].includes(statut);
  const { suivante, precedente } = etapesVoisines(statut);
  const etatMission = { engages: e.engages.length, requis: m.nb_profils_requis, briefing: !!m.briefing_le, presencesManquantes: e.presencesManquantes, bilan, rapportTransmis: !!m.rapport_transmis_le, finances: etatFin };
  const blocage = suivante ? refusTransition(statut, suivante, etatMission) : null;
  const eco = economie(m.budget_fcfa, m.remuneration_agent_fcfa, m.nb_profils_requis);

  const parId = new Map(lignes.map((l) => [l.id, l]));
  const remplacant = new Map(lignes.filter((l) => l.remplace_affectation_id).map((l) => [l.remplace_affectation_id!, l]));
  const nomCourt = (l: { prenoms: string; nom: string }) => `${l.prenoms.split(/\s+/)[0]} ${l.nom}`;

  const vue = (l: (typeof lignes)[number]): VueLigne => {
    const message = m.remuneration_agent_fcfa !== null
      ? messageProposition({
          prenom: l.prenoms, titre: m.titre, lieu: m.lieu, zone: m.zone, date_debut: m.date_debut, date_fin: m.date_fin,
          horaires: m.horaires, remuneration: m.remuneration_agent_fcfa, objectifs: m.objectifs, role: l.role,
        })
      : '';
    const numero = l.whatsapp ?? l.telephone;
    return {
      id: l.id,
      intervenantId: l.intervenant_id,
      nom: `${l.nom} ${l.prenoms}`,
      reference: l.reference,
      telephone: afficherTelephone(l.telephone),
      role: l.role,
      reponse: l.reponse,
      presence: l.presence,
      propose: l.proposee_le ? date(l.proposee_le) : null,
      canal: l.canal_proposition,
      motifRefus: l.motif_refus,
      remplacePar: remplacant.has(l.id) ? nomCourt(remplacant.get(l.id)!) : null,
      remplace: l.remplace_affectation_id && parId.get(l.remplace_affectation_id) ? nomCourt(parId.get(l.remplace_affectation_id)!) : null,
      score: l.score,
      lienWhatsApp: `${lienWhatsApp(numero)}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
      lienSms: `sms:${l.telephone}${message ? `?body=${encodeURIComponent(message)}` : ''}`,
      peutRemplacer: pointage || composition ? remplacable(l, e.remplaces) : false,
      auto: l.origine === 'automatique',
      reponseCanal: l.reponse_canal,
      echeance: l.proposition_expire_le ? dateHeure(l.proposition_expire_le) : null,
    };
  };

  const titulaires = lignes.filter((l) => l.role === 'titulaire');
  const reserveLignes = lignes.filter((l) => l.role === 'remplacant');
  const reserve = e.reserve.map((r) => ({ id: r.id, nom: nomCourt(parId.get(r.id)!) }));
  const rangActuel = ETAPES.findIndex((x) => x.code === statut);

  return (
    <div className="space-y-5">
      <Link href="/missions" className="text-sm text-marque hover:underline">← Missions</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{m.titre}</h1>
            <PuceMission statut={statut} />
          </div>
          <p className="mt-1 text-sm text-encre-douce">
            <span className="font-mono">{m.reference}</span> ·{' '}
            <Link href={`/clients/${m.client_id}`} className="font-medium text-marque hover:underline">{m.raison_sociale}</Link>
            {' · '}{m.type_mission ?? libelleCategorie(m.categorie)}
            {m.brief_id && <> · <Link href={`/briefs/${m.brief_id}`} className="hover:underline">voir le brief</Link></>}
          </p>
        </div>
        <div className="flex gap-2">
          {modifiable && <Link href={`/missions/${id}/modifier`} className="btn">Modifier</Link>}
          {modifiable && composition && <Link href={`/missions/${id}/selection`} className="btn-primaire">Sélectionner des profils</Link>}
          {['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'].includes(statut) && (
            <Link href={`/missions/${id}/rapport`} className="btn">Rapport client</Link>
          )}
          {['preuves_collectees', 'controlee', 'rapport_transmis', 'payee'].includes(statut) && (
            <Link href={`/missions/${id}/evaluations`} className={ctx.peut('mission:modifier') ? 'btn-primaire' : 'btn'}>
              {ctx.peut('mission:modifier') ? 'Évaluer l’équipe' : 'Évaluations'}
            </Link>
          )}
        </div>
      </div>

      {/* parcours de la mission (cahier des charges, section 6) */}
      {statut === 'annulee' ? (
        <div className="rounded-xl border border-trait bg-white px-4 py-3 text-sm">
          <strong>Mission annulée</strong> le {date(m.statut_change_le)} : {m.motif_annulation}
        </div>
      ) : (
        <ol className="carte flex overflow-x-auto p-2 text-xs [scrollbar-width:none]">
          {ETAPES.map((etape, i) => (
            <li
              key={etape.code}
              title={etape.module ? `Module ${etape.module}` : undefined}
              className={`flex min-w-[7.5rem] flex-1 items-center gap-2 rounded-lg px-2 py-2 ${i === rangActuel ? 'bg-marque-pale font-semibold text-marque-fonce' : i < rangActuel ? 'text-ok' : 'text-encre-douce'}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${i < rangActuel ? 'bg-ok text-white' : i === rangActuel ? 'bg-marque text-white' : 'border border-trait'}`}>
                {i < rangActuel ? '✓' : i + 1}
              </span>
              <span className={etape.module && i > rangActuel ? 'opacity-60' : ''}>{etape.libelle}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="carte p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">
                Équipe : <span className={e.engages.length >= m.nb_profils_requis ? 'text-ok' : ''}>{e.engages.length}</span> engagé{e.engages.length > 1 ? 's' : ''} sur {m.nb_profils_requis}
              </h2>
              {e.tauxPresence !== null && (
                <span className={`text-sm ${e.tauxPresence >= 0.95 ? 'text-ok' : 'text-alerte'}`}>
                  Présence : {Math.round(e.tauxPresence * 100)} % (cible 95 %)
                </span>
              )}
            </div>
            <p className="mb-2 text-xs text-encre-douce">
              {e.aProposer.length > 0 && `${e.aProposer.length} à proposer · `}
              {e.enAttente.length > 0 && `${e.enAttente.length} réponse${e.enAttente.length > 1 ? 's' : ''} attendue${e.enAttente.length > 1 ? 's' : ''} · `}
              {reserve.length} remplaçant{reserve.length > 1 ? 's' : ''} en réserve
              {m.selection_auto && composition && ' · sélection automatique active'}
            </p>
            {m.remuneration_agent_fcfa === null && modifiable && (
              <p className="mb-2 rounded-lg bg-alerte-pale px-3 py-2 text-sm text-alerte">
                Fixez la <Link href={`/missions/${id}/modifier`} className="font-semibold underline">rémunération par intervenant</Link> avant d’envoyer les propositions : elle fait partie des conditions annoncées.
              </p>
            )}

            {titulaires.length === 0 ? (
              <p className="py-4 text-sm text-encre-douce">
                Personne pour le moment.{' '}
                {modifiable && composition && <Link href={`/missions/${id}/selection`} className="text-marque hover:underline">Chercher les profils compatibles</Link>}
              </p>
            ) : (
              <ul className="divide-y divide-trait">
                {titulaires.map((l) => (
                  <LigneEquipe key={l.id} missionId={id} l={vue(l)} modifiable={modifiable} pointage={pointage} reserve={reserve} />
                ))}
              </ul>
            )}

            {reserveLignes.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-encre-douce">Réserve de remplacement</h3>
                <ul className="divide-y divide-trait">
                  {reserveLignes.map((l) => (
                    <LigneEquipe key={l.id} missionId={id} l={vue(l)} modifiable={modifiable} pointage={false} reserve={[]} />
                  ))}
                </ul>
              </>
            )}
          </section>

          {(['execution', 'preuves_collectees', 'controlee', 'rapport_transmis', 'payee'].includes(statut) ||
            bilan.validees + bilan.enAttente + bilan.rejetees > 0) && (
            <section className="carte p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">Preuves et contrôle</h2>
                <Link href={`/missions/${id}/preuves`} className="btn-primaire px-3 py-1.5 text-sm">
                  {['execution', 'preuves_collectees'].includes(statut) && modifiable ? 'Saisir et contrôler les preuves' : 'Voir les preuves'}
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {(
                  [
                    ['Validées', bilan.validees, false],
                    ['À contrôler', bilan.enAttente, bilan.enAttente > 0],
                    ['Rejetées', bilan.rejetees, false],
                    ['Incidents ouverts', bilan.incidentsOuverts, bilan.incidentsBloquants > 0],
                  ] as [string, number, boolean][]
                ).map(([k, v, alerte]) => (
                  <div key={k}>
                    <dt className="text-xs text-encre-douce">{k}</dt>
                    <dd className={`text-xl font-bold tabular-nums ${alerte ? 'text-alerte' : ''}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              {tauxRejet(bilan) !== null && (
                <p className={`mt-2 text-xs ${tauxRejet(bilan)! >= 0.05 ? 'text-alerte' : 'text-encre-douce'}`}>
                  Données rejetées : {pourcentage(tauxRejet(bilan)!)} (cible : moins de 5 %)
                </p>
              )}
            </section>
          )}

          {finances && (paiements.length > 0 || factures.length > 0 || ['controlee', 'rapport_transmis', 'payee'].includes(statut)) && (
            <section className="carte p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">Paiements et facturation</h2>
                {ctx.peut('facture:gerer') && statut !== 'annulee' && (
                  <Link href={`/finances/factures/nouvelle?mission=${id}`} className="btn px-3 py-1.5 text-sm">Facturer le client</Link>
                )}
              </div>
              <h3 className="mt-2 text-xs font-bold uppercase tracking-wide text-encre-douce">Intervenants</h3>
              {paiements.length === 0 ? (
                <p className="py-2 text-sm text-encre-douce">Les paiements naissent à l’étape « Contrôlée », un par intervenant pointé présent.</p>
              ) : (
                <ul className="divide-y divide-trait text-sm">
                  {paiements.map((p) => {
                    const d = delaiPaiement(p.du_depuis, p.paye_le);
                    return (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link href={`/intervenants/${p.intervenant_id}`} className="hover:underline">{p.nom} {p.prenoms}</Link>
                        <span className="flex items-center gap-3">
                          <span className="tabular-nums">{formaterFCFA(p.montant_fcfa)}</span>
                          <span className={`text-xs ${d.niveau === 'retard' ? 'text-danger' : d.niveau === 'attention' ? 'text-alerte' : 'text-encre-douce'}`}>
                            {p.statut === 'paye' ? `payé en ${libelleDuree(d.heures)}` : `depuis ${libelleDuree(d.heures)}`}
                          </span>
                          <PucePaiement statut={p.statut} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {paiements.some((p) => p.statut !== 'paye') && (
                <Link href="/finances/paiements" className="text-xs text-marque hover:underline">Verser les paiements →</Link>
              )}
              <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-encre-douce">Client</h3>
              {factures.length === 0 ? (
                <p className="py-2 text-sm text-encre-douce">Aucune facture ni acompte émis pour cette mission.</p>
              ) : (
                <ul className="divide-y divide-trait text-sm">
                  {factures.map((f) => {
                    const s = situationFacture(f, aujourdhuiBenin());
                    return (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <Link href={`/finances/factures/${f.id}`} className="font-mono text-marque hover:underline">{f.numero}</Link>{' '}
                          <span className="text-xs text-encre-douce">{TYPES_FACTURE[f.type].libelle}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="tabular-nums">{formaterFCFA(f.montant_fcfa)}</span>
                          {s.joursRetard > 0 && <span className="text-xs text-danger">{s.joursRetard} j de retard</span>}
                          <PuceFacture statut={f.statut} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {(communications.length > 0 || (modifiable && ['preparation', 'execution'].includes(statut) && e.engages.length > 0)) && (
            <section className="carte p-5">
              <h2 className="mb-1 font-bold">Communication</h2>
              {modifiable && ['preparation', 'execution'].includes(statut) && e.engages.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm text-encre-douce">Rappel à envoyer la veille du démarrage : date, rendez-vous, horaires.</p>
                  <ul className="divide-y divide-trait">
                    {e.engages.map((a) => {
                      const l = parId.get(a.id)!;
                      const envoye = rappels.get(l.intervenant_id);
                      return (
                        <li key={a.id} className="py-2">
                          <details>
                            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-medium">{l.nom} {l.prenoms}</span>
                              {envoye ? (
                                <span className="puce bg-ok-pale text-ok">Rappel envoyé le {dateHeure(envoye)}</span>
                              ) : (
                                <span className="puce bg-alerte-pale text-alerte">Rappel à envoyer</span>
                              )}
                            </summary>
                            <Envoi
                              cible={{ intervenantId: l.intervenant_id, missionId: id }}
                              modele="rappel"
                              telephone={l.telephone}
                              whatsapp={l.whatsapp}
                              texte={messageRappel({
                                prenoms: l.prenoms, titre: m.titre, date_debut: m.date_debut, horaires: m.horaires,
                                lieu: m.lieu, zone: m.zone, aujourdhui: aujourdhuiBenin(),
                              })}
                            />
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-encre-douce">Historique des échanges</h3>
              <HistoriqueCommunications lignes={communications} vue="mission" />
            </section>
          )}

          {!close && (composition || m.briefing_le) && (
            <section className="carte p-5">
              <h2 className="mb-1 font-bold">Briefing et préparation</h2>
              <p className="mb-3 text-sm text-encre-douce">Obligatoire avant le lancement : il trace les consignes données à l’équipe.</p>
              {modifiable ? (
                <Briefing id={id} le={versSaisieLocale(m.briefing_le)} lieu={m.briefing_lieu ?? ''} notes={m.briefing_notes ?? ''} />
              ) : (
                <p className="text-sm">{m.briefing_le ? `${dateHeure(m.briefing_le)}${m.briefing_lieu ? `, ${m.briefing_lieu}` : ''}` : 'Pas encore organisé.'}</p>
              )}
            </section>
          )}
        </div>

        <div className="space-y-5">
          {modifiable && (
            <section className="carte p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-encre-douce">Étape</h2>
              <ChangementEtape id={id} suivante={suivante} precedente={precedente} blocage={blocage} />
            </section>
          )}

          <section className="carte p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-encre-douce">Cadre</h2>
            <dl className="space-y-2 text-sm">
              {(
                [
                  ['Quand', periode(m.date_debut, m.date_fin)],
                  ['Horaires', m.horaires],
                  ['Zone', m.zone],
                  ['Département', m.departement],
                  ['Rendez-vous', m.lieu],
                  ['Compétences', m.competences.join(', ')],
                  ['Score minimum', m.score_minimum !== null ? String(m.score_minimum) : null],
                  ['Chargé(e)', m.responsable],
                  ['Briefing', m.briefing_le ? dateHeure(m.briefing_le) : null],
                ] as [string, string | null][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-encre-douce">{k}</dt>
                  <dd className="text-right">{v || '-'}</dd>
                </div>
              ))}
            </dl>
            {m.objectifs && <p className="mt-3 whitespace-pre-line border-t border-trait pt-3 text-sm">{m.objectifs}</p>}
            {m.livrables && <p className="mt-2 whitespace-pre-line text-xs text-encre-douce">Livrables : {m.livrables}</p>}
          </section>

          <section className="carte p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-encre-douce">Économie</h2>
            <dl className="space-y-2 text-sm">
              <Ligne k="Par intervenant" v={formaterFCFA(m.remuneration_agent_fcfa)} />
              <Ligne k={`Coût de ${m.nb_profils_requis} intervenant${m.nb_profils_requis > 1 ? 's' : ''}`} v={eco ? formaterFCFA(eco.cout) : '-'} />
              <Ligne k="Budget client" v={formaterFCFA(m.budget_fcfa)} />
              {eco?.marge != null && (
                <Ligne k="Marge brute" v={`${formaterFCFA(eco.marge)} (${Math.round((eco.taux ?? 0) * 100)} %)`} alerte={eco.marge < 0} />
              )}
            </dl>
          </section>

          <section className="carte p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Historique</h2>
            <ol className="space-y-2 text-sm">
              {historique.map((h, i) => (
                <li key={i}>
                  <div className="font-medium">
                    {LIBELLES_ACTIONS[h.action] ?? h.action}
                    {h.action === 'mission_statut' && ` : ${LIBELLES_STATUT_MISSION[h.details?.vers as StatutMission] ?? ''}`}
                    {h.details?.intervenant && ` : ${h.details.intervenant}`}
                    {h.action === 'affectation_reponse' && (h.details?.reponse === 'accepte' ? ' (accepte)' : ' (refuse)')}
                    {h.action === 'affectation_presence' && ` (${h.details?.presence})`}
                    {h.action === 'affectation_ajout' && ` (${h.details?.nombre} ${h.details?.role === 'remplacant' ? 'en réserve' : 'titulaire(s)'})`}
                    {h.action === 'preuve_statut' && ({ validee: ' : validée', rejetee: ' : rejetée', en_attente: ' : remise à contrôler' } as Record<string, string>)[h.details?.statut]}
                    {h.action === 'preuve_ajout' && h.details?.type && ` (${h.details.type.replace('_', '-')})`}
                    {h.action === 'paiements_generes' && ` (${h.details?.nombre}, ${formaterFCFA(h.details?.total)})`}
                    {h.action === 'paiement_verse' && h.details?.montant != null && ` (${formaterFCFA(h.details.montant)})`}
                    {h.action === 'satisfaction_client' && ` : ${h.details?.note}/5`}
                  </div>
                  <div className="text-xs text-encre-douce">
                    {dateHeure(h.cree_le)} · {h.auteur ?? '-'}
                    {h.details?.motif && ` · « ${h.details.motif} »`}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Ligne({ k, v, alerte }: { k: string; v: string; alerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-encre-douce">{k}</dt>
      <dd className={`text-right font-medium tabular-nums ${alerte ? 'text-danger' : ''}`}>{v}</dd>
    </div>
  );
}
