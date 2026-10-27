import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { STATUTS_COMMERCIAUX, situationCredit, formaterFCFA, type StatutCommercial } from '@/lib/clients/regles';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { PuceCommerciale } from '@/components/Statut';

export const metadata = { title: 'Clients' };

interface Ligne {
  id: string;
  raison_sociale: string;
  secteur: string | null;
  ville: string | null;
  contact_nom: string | null;
  contact_telephone: string | null;
  contact_email: string | null;
  statut_commercial: StatutCommercial;
  limite_credit_fcfa: number;
  briefs_ouverts: number;
  missions: number;
  encours: number;
}

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const ctx = await exiger('client:lire');
  const { q = '', statut = '' } = await searchParams;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    conditions.push(`(lower(c.raison_sociale) LIKE $${params.length} OR lower(coalesce(c.contact_nom, '')) LIKE $${params.length} OR lower(coalesce(c.secteur, '')) LIKE $${params.length})`);
  }
  if (statut in STATUTS_COMMERCIAUX) {
    params.push(statut);
    conditions.push(`c.statut_commercial = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [lignes, parStatut] = await Promise.all([
    requete<Ligne>(
      `SELECT c.id, c.raison_sociale, c.secteur, c.ville, c.contact_nom, c.contact_telephone, c.contact_email,
              c.statut_commercial, c.limite_credit_fcfa,
              (SELECT count(*) FROM brief b WHERE b.client_id = c.id AND b.statut = 'recu')::int AS briefs_ouverts,
              (SELECT count(*) FROM mission m WHERE m.client_id = c.id AND m.statut <> 'annulee')::int AS missions,
              (SELECT coalesce(sum(f.montant_fcfa - f.montant_regle_fcfa), 0) FROM facture f
                WHERE f.client_id = c.id AND f.statut IN ('emise', 'partielle'))::bigint AS encours
         FROM client c ${where}
        ORDER BY c.raison_sociale`,
      params,
    ),
    requete<{ statut_commercial: StatutCommercial; n: number }>('SELECT statut_commercial, count(*)::int AS n FROM client GROUP BY 1'),
  ]);
  const compte = (s: string) => parStatut.find((x) => x.statut_commercial === s)?.n ?? 0;
  const total = parStatut.reduce((t, x) => t + x.n, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-encre-douce">{total} entreprise{total > 1 ? 's' : ''} dans la base</p>
        </div>
        <div className="flex gap-2">
          <Link href="/briefs" className="btn">Briefs à traiter</Link>
          {ctx.peut('client:modifier') && <Link href="/clients/nouveau" className="btn-primaire">+ Nouveau client</Link>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/clients" className={`rounded-full border px-3 py-1 ${!statut ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}>
          Tous <span className="text-encre-douce">{total}</span>
        </Link>
        {(Object.keys(STATUTS_COMMERCIAUX) as StatutCommercial[]).map((s) => (
          <Link
            key={s}
            href={`/clients?statut=${s}`}
            className={`rounded-full border px-3 py-1 ${statut === s ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
          >
            {STATUTS_COMMERCIAUX[s].libelle} <span className="text-encre-douce">{compte(s)}</span>
          </Link>
        ))}
      </div>

      <form className="flex gap-2">
        {statut && <input type="hidden" name="statut" value={statut} />}
        <input name="q" defaultValue={q} placeholder="Entreprise, contact, secteur…" className="champ max-w-md" />
        <button className="btn-primaire">Chercher</button>
        {q && <Link href={statut ? `/clients?statut=${statut}` : '/clients'} className="btn">Effacer</Link>}
      </form>

      {lignes.length === 0 ? (
        <div className="carte p-10 text-center text-encre-douce">
          {q || statut ? 'Aucun client ne correspond.' : 'Aucun client enregistré pour le moment.'}
        </div>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-trait bg-papier text-left text-xs uppercase tracking-wide text-encre-douce">
              <tr>
                <th className="px-4 py-2.5">Entreprise</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 text-right">Briefs à traiter</th>
                <th className="px-4 py-2.5 text-right">Missions</th>
                <th className="px-4 py-2.5 text-right">Encours</th>
                <th className="px-4 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {lignes.map((l) => {
                const credit = situationCredit(l.encours, l.limite_credit_fcfa);
                return (
                  <tr key={l.id} className="hover:bg-papier/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${l.id}`} className="font-semibold text-marque-fonce hover:underline">{l.raison_sociale}</Link>
                      <div className="text-xs text-encre-douce">{[l.secteur, l.ville].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.contact_nom ?? '—'}
                      <div className="text-xs text-encre-douce">{l.contact_telephone ? afficherTelephone(l.contact_telephone) : l.contact_email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {l.briefs_ouverts > 0 ? <span className="puce bg-alerte-pale text-alerte">{l.briefs_ouverts}</span> : <span className="text-encre-douce">0</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.missions}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${credit.niveau === 'depasse' ? 'font-semibold text-danger' : credit.niveau === 'proche' ? 'text-alerte' : ''}`}>
                      {l.encours ? formaterFCFA(l.encours) : '—'}
                      {credit.niveau === 'depasse' && <div className="text-xs">Limite dépassée</div>}
                    </td>
                    <td className="px-4 py-2.5"><PuceCommerciale statut={l.statut_commercial} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
