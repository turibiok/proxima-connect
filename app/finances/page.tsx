import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { date } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import { aujourdhuiBenin, DELAI_PAIEMENT, delaiPaiement, libelleDuree, RETARD_IMPORTANT_JOURS, TRESORERIES } from '@/lib/finances/regles';
import { clientsAuxLimites, facturesEnRetard, paiementsEnAttente, syntheseFactures, synthesePaiements } from '@/lib/finances/donnees';

export const metadata = { title: 'Finances' };

export default async function VueFinances() {
  await exiger('finance:lire');
  const jour = aujourdhuiBenin();
  const [p, tresoreries, retards, limites, attente] = await Promise.all([
    synthesePaiements(),
    syntheseFactures(jour),
    facturesEnRetard(jour),
    clientsAuxLimites(),
    paiementsEnAttente(),
  ]);
  const t = (code: 'missions' | 'administrative') => tresoreries.find((x) => x.tresorerie === code) ?? { encaisse: 0, a_encaisser: 0, echu: 0 };
  const mi = t('missions');
  const ad = t('administrative');
  const alertes = attente.length + retards.length + limites.length + p.litiges;

  return (
    <div className="space-y-5">
      {/* cahier des charges 5.6 : separation visible des deux tresoreries */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="carte border-t-4 border-t-marque p-5">
          <h2 className="font-bold">{TRESORERIES.missions.libelle}</h2>
          <p className="mb-3 text-xs text-encre-douce">{TRESORERIES.missions.aide}.</p>
          <dl className="space-y-2 text-sm">
            <Ligne k="Encaissé des clients" v={formaterFCFA(mi.encaisse)} />
            <Ligne k="Versé aux intervenants" v={`- ${formaterFCFA(p.verse)}`} />
            <Ligne k="Solde des missions" v={formaterFCFA(mi.encaisse - p.verse)} fort alerte={mi.encaisse - p.verse < 0} />
          </dl>
          <dl className="mt-3 space-y-2 border-t border-trait pt-3 text-sm">
            <Ligne k="À encaisser" v={formaterFCFA(mi.a_encaisser)} />
            {mi.echu > 0 && <Ligne k="dont échu" v={formaterFCFA(mi.echu)} alerte />}
            <Ligne k="À verser aux intervenants" v={formaterFCFA(p.a_verser)} />
          </dl>
          {mi.encaisse - p.verse < 0 && (
            <p className="mt-3 text-xs text-encre-douce">
              Solde négatif : PROXIMA avance la paie des intervenants avant l’encaissement des clients, comme prévu par l’objectif de 48 à 72 h.
            </p>
          )}
        </section>

        <section className="carte border-t-4 border-t-accent p-5">
          <h2 className="font-bold">{TRESORERIES.administrative.libelle}</h2>
          <p className="mb-3 text-xs text-encre-douce">{TRESORERIES.administrative.aide}.</p>
          <dl className="space-y-2 text-sm">
            <Ligne k="Encaissé" v={formaterFCFA(ad.encaisse)} fort />
          </dl>
          <dl className="mt-3 space-y-2 border-t border-trait pt-3 text-sm">
            <Ligne k="À encaisser" v={formaterFCFA(ad.a_encaisser)} />
            {ad.echu > 0 && <Ligne k="dont échu" v={formaterFCFA(ad.echu)} alerte />}
          </dl>
          <p className="mt-3 text-xs text-encre-douce">Les dépenses de structure (loyer, salaires, abonnements) ne sont pas suivies dans le programme.</p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre
          libelle="Délai de paiement"
          valeur={p.delai_median === null ? '-' : libelleDuree(Math.round(p.delai_median))}
          detail={`médiane sur 90 jours · objectif ${DELAI_PAIEMENT.cible} à ${DELAI_PAIEMENT.limite} h`}
          alerte={p.delai_median !== null && p.delai_median > DELAI_PAIEMENT.limite}
        />
        <Chiffre
          libelle="Payés dans les 72 h"
          valeur={p.payes_90 ? `${Math.round((p.dans_delai_90 / p.payes_90) * 100)} %` : '-'}
          detail={`${p.dans_delai_90} sur ${p.payes_90} paiement${p.payes_90 > 1 ? 's' : ''} (90 jours)`}
        />
        <Chiffre libelle="À verser" valeur={String(p.a_payer)} detail={`${p.en_retard} en retard · ${p.litiges} en litige`} alerte={p.en_retard > 0} />
        <Chiffre libelle="Factures échues" valeur={formaterFCFA(mi.echu + ad.echu)} detail={`${retards.length} en retard de plus de ${RETARD_IMPORTANT_JOURS} jours`} alerte={retards.length > 0} />
      </div>

      <section className="carte p-5">
        <h2 className="mb-3 font-bold">À traiter {alertes > 0 && <span className="puce ml-1 bg-danger-pale text-danger">{alertes}</span>}</h2>
        {alertes === 0 ? (
          <p className="text-sm text-encre-douce">Rien en retard : intervenants payés dans les délais, clients à jour.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {attente.map((a) => {
              const d = delaiPaiement(a.du_depuis, null);
              return (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <strong className={d.niveau === 'retard' ? 'text-danger' : 'text-alerte'}>
                      {d.niveau === 'retard' ? 'Paiement en retard' : 'Paiement à verser vite'}
                    </strong>{' '}
                    : <Link href={`/intervenants/${a.intervenant_id}`} className="text-marque hover:underline">{a.nom} {a.prenoms}</Link>,{' '}
                    {formaterFCFA(a.montant_fcfa)} pour <Link href={`/missions/${a.mission_id}`} className="font-mono text-xs hover:underline">{a.reference}</Link>
                  </span>
                  <span className="text-xs text-encre-douce">validée il y a {libelleDuree(d.heures)}</span>
                </li>
              );
            })}
            {p.litiges > 0 && (
              <li className="py-2">
                <strong className="text-danger">Litiges</strong> : {p.litiges} paiement{p.litiges > 1 ? 's' : ''} contesté{p.litiges > 1 ? 's' : ''}.{' '}
                <Link href="/finances/paiements?statut=en_litige" className="text-marque hover:underline">Les traiter</Link>
              </li>
            )}
            {retards.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <strong className="text-danger">Retard de règlement</strong> :{' '}
                  <Link href={`/finances/factures/${f.id}`} className="font-mono text-xs text-marque hover:underline">{f.numero}</Link>,{' '}
                  <Link href={`/clients/${f.client_id}`} className="hover:underline">{f.raison_sociale}</Link>, reste {formaterFCFA(f.reste)}
                </span>
                <span className="text-xs text-encre-douce">échue le {date(f.echeance_le)} ({f.jours} jours)</span>
              </li>
            ))}
            {limites.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <strong className={c.encours > c.limite ? 'text-danger' : 'text-alerte'}>
                    {c.encours > c.limite ? 'Limite de crédit dépassée' : 'Limite de crédit bientôt atteinte'}
                  </strong>{' '}
                  : <Link href={`/clients/${c.id}`} className="text-marque hover:underline">{c.raison_sociale}</Link>
                </span>
                <span className="text-xs text-encre-douce">encours {formaterFCFA(c.encours)} / limite {formaterFCFA(c.limite)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Ligne({ k, v, fort, alerte }: { k: string; v: string; fort?: boolean; alerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-encre-douce">{k}</dt>
      <dd className={`text-right tabular-nums ${fort ? 'text-base font-bold' : 'font-medium'} ${alerte ? 'text-danger' : ''}`}>{v}</dd>
    </div>
  );
}

function Chiffre({ libelle, valeur, detail, alerte }: { libelle: string; valeur: string; detail: string; alerte?: boolean }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-encre-douce">{libelle}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${alerte ? 'text-danger' : ''}`}>{valeur}</div>
      <div className="mt-1 text-xs text-encre-douce">{detail}</div>
    </div>
  );
}
