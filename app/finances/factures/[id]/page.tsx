import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { date, dateHeure } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import {
  aujourdhuiBenin,
  MODES_REGLEMENT,
  RETARD_IMPORTANT_JOURS,
  situationFacture,
  TRESORERIES,
  TYPES_FACTURE,
  type ModeReglement,
  type StatutFacture,
  type Tresorerie,
  type TypeFacture,
} from '@/lib/finances/regles';
import { PuceFacture } from '@/components/Statut';
import { Annulation, Reglement } from './Actions';

export const metadata = { title: 'Facture' };

export default async function Facture({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('finance:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const f = await une<{
    id: string; numero: string; type: TypeFacture; tresorerie: Tresorerie; objet: string | null; montant_fcfa: number; montant_regle_fcfa: number;
    emise_le: string; echeance_le: string | null; statut: StatutFacture; motif_annulation: string | null; annulee_le: Date | null;
    client_id: string; raison_sociale: string; ifu: string | null; adresse_facturation: string | null; contact_nom: string | null;
    mission_id: string | null; reference: string | null; titre: string | null; emise_par: string | null; annulee_par: string | null;
  }>(
    `SELECT f.*, c.raison_sociale, c.ifu, c.adresse_facturation, c.contact_nom, m.reference, m.titre,
            ue.nom_complet AS emise_par, ua.nom_complet AS annulee_par
       FROM facture f JOIN client c ON c.id = f.client_id LEFT JOIN mission m ON m.id = f.mission_id
       LEFT JOIN utilisateur ue ON ue.id = f.emise_par LEFT JOIN utilisateur ua ON ua.id = f.annulee_par
      WHERE f.id = $1`,
    [id],
  );
  if (!f) notFound();

  const reglements = await requete<{ id: string; montant_fcfa: number; mode: ModeReglement; reference_transaction: string; regle_le: string; saisi_le: Date; auteur: string | null }>(
    `SELECT r.id, r.montant_fcfa, r.mode, r.reference_transaction, r.regle_le, r.saisi_le, u.nom_complet AS auteur
       FROM reglement r LEFT JOIN utilisateur u ON u.id = r.saisi_par WHERE r.facture_id = $1 ORDER BY r.regle_le, r.saisi_le`,
    [id],
  );

  const jour = aujourdhuiBenin();
  const s = situationFacture(f, jour);
  const gestion = ctx.peut('facture:gerer');

  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/finances/factures" className="text-sm text-marque hover:underline">← Factures</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-xl font-bold">{f.numero}</h2>
            <PuceFacture statut={f.statut} />
          </div>
          <p className="mt-1 text-sm text-encre-douce">
            {TYPES_FACTURE[f.type].libelle} · {TRESORERIES[f.tresorerie].libelle} · émise le {date(f.emise_le)}{f.emise_par && ` par ${f.emise_par}`}
          </p>
        </div>
      </div>

      {f.statut === 'annulee' && (
        <div className="rounded-xl border border-trait bg-white px-4 py-3 text-sm">
          <strong>Facture annulée</strong> le {date(f.annulee_le)}{f.annulee_par && ` par ${f.annulee_par}`} : {f.motif_annulation}
        </div>
      )}
      {s.joursRetard > 0 && (
        <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${s.niveau === 'retard_important' ? 'border-danger/30 bg-danger-pale text-danger' : 'border-alerte/30 bg-alerte-pale text-alerte'}`}>
          <strong>{s.niveau === 'retard_important' ? 'Retard de paiement important' : 'Facture échue'}</strong> : {s.joursRetard} jour{s.joursRetard > 1 ? 's' : ''} après l’échéance
          {s.niveau === 'retard_important' ? ` (seuil d’alerte : ${RETARD_IMPORTANT_JOURS} jours)` : ''}. Reste dû : {formaterFCFA(s.reste)}.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="carte p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-encre-douce">Client</h3>
                <Link href={`/clients/${f.client_id}`} className="font-semibold text-marque-fonce hover:underline">{f.raison_sociale}</Link>
                {f.ifu && <p className="text-sm">IFU {f.ifu}</p>}
                {f.contact_nom && <p className="text-sm">À l’attention de {f.contact_nom}</p>}
                {f.adresse_facturation && <p className="whitespace-pre-line text-sm text-encre-douce">{f.adresse_facturation}</p>}
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-encre-douce">Objet</h3>
                <p className="text-sm">{f.objet ?? '-'}</p>
                {f.mission_id && (
                  <p className="mt-1 text-sm">
                    Mission <Link href={`/missions/${f.mission_id}`} className="font-mono text-marque hover:underline">{f.reference}</Link> {f.titre}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="carte p-5">
            <h3 className="mb-3 font-bold">Règlements ({reglements.length})</h3>
            {reglements.length === 0 ? (
              <p className="text-sm text-encre-douce">Aucun règlement reçu.</p>
            ) : (
              <ul className="divide-y divide-trait text-sm">
                {reglements.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <strong className="tabular-nums">{formaterFCFA(r.montant_fcfa)}</strong> le {date(r.regle_le)} · {MODES_REGLEMENT[r.mode]} · réf.{' '}
                      <span className="font-mono">{r.reference_transaction}</span>
                    </span>
                    <span className="text-xs text-encre-douce">saisi le {dateHeure(r.saisi_le)}{r.auteur && ` par ${r.auteur}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {gestion && s.reste > 0 && <Reglement factureId={f.id} reste={s.reste} aujourdhui={jour} />}
          </section>
        </div>

        <div className="space-y-5">
          <section className="carte p-5">
            <dl className="space-y-2 text-sm">
              <Ligne k="Montant" v={formaterFCFA(f.montant_fcfa)} />
              <Ligne k="Réglé" v={formaterFCFA(f.montant_regle_fcfa)} />
              <Ligne k="Reste dû" v={formaterFCFA(s.reste)} fort />
              <Ligne k="Échéance" v={date(f.echeance_le)} />
            </dl>
            {f.statut !== 'annulee' && f.montant_fcfa > 0 && (
              <div className="mt-3 h-2 rounded-full bg-papier" aria-hidden>
                <div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, (f.montant_regle_fcfa / f.montant_fcfa) * 100)}%` }} />
              </div>
            )}
          </section>
          {gestion && f.statut !== 'annulee' && f.montant_regle_fcfa === 0 && (
            <section className="carte p-5">
              <Annulation factureId={f.id} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Ligne({ k, v, fort }: { k: string; v: string; fort?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-encre-douce">{k}</dt>
      <dd className={`text-right tabular-nums ${fort ? 'text-base font-bold' : 'font-medium'}`}>{v}</dd>
    </div>
  );
}
