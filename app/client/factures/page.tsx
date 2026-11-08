import { requete } from '@/lib/db';
import { date } from '@/lib/format';
import { exigerClient } from '@/lib/client/session';
import { formaterFCFA } from '@/lib/clients/regles';
import { aujourdhuiBenin, situationFacture, STATUTS_FACTURE, TYPES_FACTURE, type StatutFacture, type TypeFacture } from '@/lib/finances/regles';

export const metadata = { title: 'Factures' };

/** Factures et acomptes de l'entreprise cliente, avec le reste a regler. */
export default async function FacturesClient() {
  const k = await exigerClient();
  const factures = await requete<{ id: string; numero: string; type: TypeFacture; objet: string | null; montant_fcfa: number; montant_regle_fcfa: number; emise_le: string; echeance_le: string | null; statut: StatutFacture; reference: string | null }>(
    `SELECT f.id, f.numero, f.type, f.objet, f.montant_fcfa, f.montant_regle_fcfa, f.emise_le, f.echeance_le, f.statut, m.reference
       FROM facture f LEFT JOIN mission m ON m.id = f.mission_id
      WHERE f.client_id = $1 AND f.statut <> 'annulee' AND f.type <> 'devis'
      ORDER BY f.emise_le DESC, f.numero DESC`,
    [k.client_id],
  );
  const jour = aujourdhuiBenin();
  const reste = factures.reduce((t, f) => t + situationFacture(f, jour).reste, 0);

  return (
    <div className="space-y-4">
      <section className="carte flex flex-wrap items-baseline justify-between gap-2 p-5">
        <h2 className="font-bold">Reste à régler</h2>
        <span className="text-2xl font-bold tabular-nums">{formaterFCFA(reste)}</span>
      </section>
      {factures.length === 0 ? (
        <p className="carte p-6 text-sm text-encre-douce">Aucune facture pour le moment.</p>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Numéro</th>
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
                  <tr key={f.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold">{f.numero}</span>
                      <div className="text-xs text-encre-douce">
                        {TYPES_FACTURE[f.type].libelle} du {date(f.emise_le)}{f.reference && ` · mission ${f.reference}`}
                        {f.objet && <span className="block max-w-[18rem] truncate">{f.objet}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formaterFCFA(f.montant_fcfa)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{s.reste ? formaterFCFA(s.reste) : '-'}</td>
                    <td className="px-4 py-2.5">
                      {date(f.echeance_le)}
                      {s.joursRetard > 0 && <div className="text-xs font-medium text-danger">échue depuis {s.joursRetard} jour{s.joursRetard > 1 ? 's' : ''}</div>}
                    </td>
                    <td className="px-4 py-2.5">{STATUTS_FACTURE[f.statut].libelle}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-encre-douce">Pour obtenir un duplicata ou signaler une erreur, contactez votre interlocuteur commercial chez PROXIMA.</p>
    </div>
  );
}
