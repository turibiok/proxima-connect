import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { LIBELLES_ACTIONS } from '@/lib/journal';
import { date, dateHeure, periode } from '@/lib/format';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { formaterFCFA, situationCredit, STATUTS_COMMERCIAUX, type StatutBrief, type StatutCommercial } from '@/lib/clients/regles';
import { libelleCategorie } from '@/lib/referentiel';
import { PuceBrief, PuceCommerciale } from '@/components/Statut';
import { ChoixStatutCommercial } from './StatutCommercial';

export const metadata = { title: 'Fiche client' };

export default async function FicheClient({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('client:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const c = await une<Record<string, any>>('SELECT * FROM client WHERE id = $1', [id]);
  if (!c) notFound();

  const [briefs, missions, factures, historique] = await Promise.all([
    requete<{ id: string; objectif: string; categorie: string | null; type_mission: string | null; nb_profils: number | null; date_debut: string | null; date_fin: string | null; budget_fcfa: number | null; statut: StatutBrief; recu_le: Date }>(
      `SELECT id, objectif, categorie, type_mission, nb_profils, date_debut, date_fin, budget_fcfa, statut, recu_le
         FROM brief WHERE client_id = $1 ORDER BY (statut = 'recu') DESC, recu_le DESC`,
      [id],
    ),
    requete<{ id: string; reference: string; titre: string; statut: string; date_debut: string | null; date_fin: string | null }>(
      `SELECT id, reference, titre, statut, date_debut, date_fin FROM mission WHERE client_id = $1 ORDER BY cree_le DESC`,
      [id],
    ),
    une<{ encours: number; en_retard: number }>(
      `SELECT coalesce(sum(montant_fcfa - montant_regle_fcfa), 0)::bigint AS encours,
              count(*) FILTER (WHERE echeance_le < current_date)::int AS en_retard
         FROM facture WHERE client_id = $1 AND statut IN ('emise', 'partielle')`,
      [id],
    ),
    requete<{ action: string; details: any; cree_le: Date; auteur: string | null }>(
      `SELECT j.action, j.details, j.cree_le, u.nom_complet AS auteur
         FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE (j.entite = 'client' AND j.entite_id = $1::text)
           OR (j.entite = 'brief' AND j.entite_id IN (SELECT id::text FROM brief WHERE client_id = $1::uuid))
        ORDER BY j.cree_le DESC LIMIT 20`,
      [id],
    ),
  ]);

  const credit = situationCredit(factures?.encours ?? 0, c.limite_credit_fcfa);
  const modifiable = ctx.peut('client:modifier');
  const briefsOuverts = briefs.filter((b) => b.statut === 'recu').length;

  return (
    <div className="space-y-5">
      <Link href="/clients" className="text-sm text-marque hover:underline">← Clients</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{c.raison_sociale}</h1>
            <PuceCommerciale statut={c.statut_commercial} />
          </div>
          <p className="mt-1 text-sm text-encre-douce">
            {[c.secteur, c.ville, c.ifu && `IFU ${c.ifu}`].filter(Boolean).join(' · ') || 'Secteur non renseigné'} · client depuis le {date(c.cree_le)}
          </p>
        </div>
        {modifiable && (
          <div className="flex gap-2">
            <Link href={`/clients/${id}/modifier`} className="btn">Modifier</Link>
            <Link href={`/clients/${id}/brief`} className="btn-primaire">+ Nouveau brief</Link>
          </div>
        )}
      </div>

      {credit.niveau !== 'ok' && (
        <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${credit.niveau === 'depasse' ? 'border-danger/30 bg-danger-pale text-danger' : 'border-alerte/30 bg-alerte-pale text-alerte'}`}>
          <strong>{credit.niveau === 'depasse' ? 'Limite de crédit dépassée.' : 'Limite de crédit bientôt atteinte.'}</strong>{' '}
          Encours de {formaterFCFA(credit.encours)} pour une limite de {formaterFCFA(credit.limite)}. Demandez un règlement ou un acompte avant de lancer une nouvelle mission.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Bloc titre={`Briefs (${briefs.length})`} action={briefsOuverts > 0 ? <span className="puce bg-alerte-pale text-alerte">{briefsOuverts} à traiter</span> : null}>
            {briefs.length === 0 ? (
              <p className="text-sm text-encre-douce">
                Aucun brief pour ce client.{' '}
                {modifiable && <Link href={`/clients/${id}/brief`} className="text-marque hover:underline">Saisir le premier brief</Link>}
              </p>
            ) : (
              <ul className="divide-y divide-trait">
                {briefs.map((b) => (
                  <li key={b.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/briefs/${b.id}`} className="min-w-0 font-medium text-marque-fonce hover:underline">
                        {b.type_mission ?? (b.categorie ? libelleCategorie(b.categorie) : 'Brief')}
                      </Link>
                      <PuceBrief statut={b.statut} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-encre-douce">{b.objectif}</p>
                    <p className="mt-1 text-xs text-encre-douce">
                      Reçu le {date(b.recu_le)} · {periode(b.date_debut, b.date_fin)}
                      {b.nb_profils && ` · ${b.nb_profils} personne${b.nb_profils > 1 ? 's' : ''}`}
                      {b.budget_fcfa !== null && ` · ${formaterFCFA(b.budget_fcfa)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Bloc>

          <Bloc titre={`Historique des missions (${missions.length})`}>
            {missions.length === 0 ? (
              <p className="text-sm text-encre-douce">Aucune mission réalisée pour ce client.</p>
            ) : (
              <ul className="divide-y divide-trait text-sm">
                {missions.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <span><span className="font-mono text-xs">{m.reference}</span> {m.titre}</span>
                    <span className="text-encre-douce">{periode(m.date_debut, m.date_fin)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloc>

          {c.notes && (
            <Bloc titre="Notes internes">
              <p className="whitespace-pre-line text-sm">{c.notes}</p>
            </Bloc>
          )}
        </div>

        <div className="space-y-5">
          {modifiable && (
            <Bloc titre="Statut commercial">
              <ChoixStatutCommercial id={id} actuel={c.statut_commercial as StatutCommercial} />
              <p className="mt-2 text-xs text-encre-douce">
                {STATUTS_COMMERCIAUX[c.statut_commercial as StatutCommercial].aide}, depuis le {date(c.statut_change_le)}.
              </p>
            </Bloc>
          )}

          <Bloc titre="Contact">
            <p className="font-medium">{c.contact_nom ?? '-'}</p>
            {c.contact_fonction && <p className="text-sm text-encre-douce">{c.contact_fonction}</p>}
            <div className="mt-2 space-y-1 text-sm">
              {c.contact_telephone && (
                <a href={`tel:${c.contact_telephone}`} className="block text-marque hover:underline">{afficherTelephone(c.contact_telephone)}</a>
              )}
              {c.contact_email && <a href={`mailto:${c.contact_email}`} className="block text-marque hover:underline">{c.contact_email}</a>}
            </div>
          </Bloc>

          <Bloc titre="Facturation et crédit">
            <dl className="space-y-2 text-sm">
              <Ligne k="Délai de paiement" v={`${c.delai_paiement_jours} jours`} />
              <Ligne k="Acompte" v={c.acompte_pourcent ? `${c.acompte_pourcent} % à la commande` : 'Aucun'} />
              <Ligne k="Limite de crédit" v={c.limite_credit_fcfa ? formaterFCFA(c.limite_credit_fcfa) : 'Aucune'} />
              <Ligne k="Encours" v={formaterFCFA(credit.encours)} />
              {(factures?.en_retard ?? 0) > 0 && <Ligne k="Factures en retard" v={String(factures!.en_retard)} />}
            </dl>
            {credit.taux !== null && (
              <div className="mt-3 h-2 rounded-full bg-papier" aria-hidden>
                <div
                  className={`h-full rounded-full ${credit.niveau === 'depasse' ? 'bg-danger' : credit.niveau === 'proche' ? 'bg-accent' : 'bg-ok'}`}
                  style={{ width: `${Math.min(100, credit.taux * 100)}%` }}
                />
              </div>
            )}
            {c.conditions_paiement && <p className="mt-3 text-xs text-encre-douce">{c.conditions_paiement}</p>}
            {c.adresse_facturation && <p className="mt-3 whitespace-pre-line text-sm">{c.adresse_facturation}</p>}
          </Bloc>

          <Bloc titre="Historique">
            {historique.length === 0 ? (
              <p className="text-sm text-encre-douce">Aucun événement.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {historique.map((h, i) => (
                  <li key={i}>
                    <div className="font-medium">
                      {LIBELLES_ACTIONS[h.action] ?? h.action}
                      {h.details?.vers && h.action === 'client_statut' && ` : ${STATUTS_COMMERCIAUX[h.details.vers as StatutCommercial]?.libelle}`}
                    </div>
                    <div className="text-xs text-encre-douce">{dateHeure(h.cree_le)} · {h.auteur ?? '-'}</div>
                  </li>
                ))}
              </ol>
            )}
          </Bloc>
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, action, children }: { titre: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="carte p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-encre-douce">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-encre-douce">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{v}</dd>
    </div>
  );
}
