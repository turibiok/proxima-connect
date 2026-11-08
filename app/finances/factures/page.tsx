import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { date } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import {
  aujourdhuiBenin,
  RETARD_IMPORTANT_JOURS,
  situationFacture,
  TRESORERIES,
  TYPES_FACTURE,
  type StatutFacture,
  type Tresorerie,
  type TypeFacture,
} from '@/lib/finances/regles';
import { PuceFacture } from '@/components/Statut';

export const metadata = { title: 'Factures clients' };

const FILTRES = [
  { code: 'a_encaisser', libelle: 'À encaisser', sql: `f.statut IN ('emise', 'partielle')` },
  { code: 'echues', libelle: 'Échues', sql: `f.statut IN ('emise', 'partielle') AND f.echeance_le < $1::date` },
  { code: 'reglees', libelle: 'Réglées', sql: `f.statut = 'reglee'` },
  { code: 'annulees', libelle: 'Annulées', sql: `f.statut = 'annulee'` },
  { code: 'toutes', libelle: 'Toutes', sql: 'true' },
];

export default async function Factures({ searchParams }: { searchParams: Promise<{ filtre?: string; tresorerie?: string }> }) {
  const ctx = await exiger('finance:lire');
  const sp = await searchParams;
  const actif = FILTRES.find((f) => f.code === sp.filtre) ?? FILTRES[0];
  const tresorerie = sp.tresorerie && sp.tresorerie in TRESORERIES ? (sp.tresorerie as Tresorerie) : null;
  const jour = aujourdhuiBenin();

  const [factures, comptes] = await Promise.all([
    requete<{
      id: string; numero: string; type: TypeFacture; tresorerie: Tresorerie; objet: string | null; montant_fcfa: number; montant_regle_fcfa: number;
      emise_le: string; echeance_le: string | null; statut: StatutFacture; client_id: string; raison_sociale: string; mission_id: string | null; reference: string | null;
    }>(
      `SELECT f.id, f.numero, f.type, f.tresorerie, f.objet, f.montant_fcfa, f.montant_regle_fcfa, f.emise_le, f.echeance_le, f.statut,
              c.id AS client_id, c.raison_sociale, m.id AS mission_id, m.reference,
              $1::date AS jour -- type du parametre fixe, meme quand le filtre ne s'en sert pas
         FROM facture f JOIN client c ON c.id = f.client_id LEFT JOIN mission m ON m.id = f.mission_id
        WHERE ${actif.sql} AND ($2::text IS NULL OR f.tresorerie = $2) AND f.type <> 'devis'
        ORDER BY CASE WHEN f.statut IN ('emise', 'partielle') THEN f.echeance_le END NULLS LAST, f.emise_le DESC, f.numero DESC
        LIMIT 300`,
      [jour, tresorerie],
    ),
    requete<Record<string, number>>(
      `SELECT ${FILTRES.map((f) => `count(*) FILTER (WHERE ${f.sql})::int AS ${f.code}`).join(', ')}
         FROM facture f WHERE ($2::text IS NULL OR f.tresorerie = $2) AND f.type <> 'devis'`,
      [jour, tresorerie],
    ),
  ]);
  const lien = (o: { filtre?: string; tresorerie?: string | null }) => {
    const q = new URLSearchParams();
    const filtre = o.filtre ?? actif.code;
    const t = o.tresorerie === undefined ? tresorerie : o.tresorerie;
    if (filtre !== FILTRES[0].code) q.set('filtre', filtre);
    if (t) q.set('tresorerie', t);
    return `/finances/factures${q.size ? `?${q}` : ''}`;
  };
  const totalReste = factures.reduce((t, f) => t + situationFacture(f, jour).reste, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {FILTRES.map((f) => (
            <Link key={f.code} href={lien({ filtre: f.code })} className={`rounded-full border px-3 py-1 ${actif.code === f.code ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
              {f.libelle} <span className="text-encre-douce">{comptes[0]?.[f.code] ?? 0}</span>
            </Link>
          ))}
        </div>
        {ctx.peut('facture:gerer') && <Link href="/finances/factures/nouvelle" className="btn-primaire">+ Facture ou acompte</Link>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-encre-douce">Trésorerie :</span>
        {[null, 'missions', 'administrative'].map((t) => (
          <Link key={t ?? 'toutes'} href={lien({ tresorerie: t })} className={`rounded-full border px-2.5 py-0.5 ${tresorerie === t ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
            {t ? TRESORERIES[t as Tresorerie].libelle.replace('Trésorerie ', '') : 'Toutes'}
          </Link>
        ))}
      </div>

      {factures.length === 0 ? (
        <div className="carte p-10 text-center text-sm text-encre-douce">Aucune facture dans cette catégorie.</div>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Numéro</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5 text-right">Montant</th>
                <th className="px-4 py-2.5 text-right">Reste dû</th>
                <th className="px-4 py-2.5">Échéance</th>
                <th className="px-4 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {factures.map((f) => {
                const s = situationFacture(f, jour);
                return (
                  <tr key={f.id} className="hover:bg-papier/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/finances/factures/${f.id}`} className="font-mono font-semibold text-marque-fonce hover:underline">{f.numero}</Link>
                      <div className="text-xs text-encre-douce">
                        {TYPES_FACTURE[f.type].libelle}
                        {f.tresorerie === 'administrative' && ' · administrative'}
                        {f.reference && <> · <Link href={`/missions/${f.mission_id}`} className="font-mono hover:underline">{f.reference}</Link></>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${f.client_id}`} className="hover:underline">{f.raison_sociale}</Link>
                      {f.objet && <div className="max-w-[18rem] truncate text-xs text-encre-douce">{f.objet}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formaterFCFA(f.montant_fcfa)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{s.reste ? formaterFCFA(s.reste) : '-'}</td>
                    <td className="px-4 py-2.5">
                      {date(f.echeance_le)}
                      {s.joursRetard > 0 && (
                        <div className={`text-xs font-medium ${s.niveau === 'retard_important' ? 'text-danger' : 'text-alerte'}`}>
                          {s.joursRetard} jour{s.joursRetard > 1 ? 's' : ''} de retard
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><PuceFacture statut={f.statut} /></td>
                  </tr>
                );
              })}
            </tbody>
            {totalReste > 0 && (
              <tfoot className="border-t border-trait bg-papier text-sm">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-encre-douce">Reste dû sur cette liste</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">{formaterFCFA(totalReste)}</td>
                  <td colSpan={2} className="px-4 py-2.5 text-xs text-encre-douce">alerte au-delà de {RETARD_IMPORTANT_JOURS} jours de retard</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
