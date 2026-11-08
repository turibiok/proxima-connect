import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { formaterFCFA } from '@/lib/clients/regles';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';
import { aujourdhuiBenin, suggestionsFacture } from '@/lib/finances/regles';
import { FormulaireFacture } from './Formulaire';

export const metadata = { title: 'Nouvelle facture' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NouvelleFacture({ searchParams }: { searchParams: Promise<{ client?: string; mission?: string }> }) {
  await exiger('facture:gerer');
  const sp = await searchParams;
  let clientId = sp.client && UUID.test(sp.client) ? sp.client : null;
  const missionDemandee = sp.mission && UUID.test(sp.mission) ? sp.mission : null;

  // depuis une mission, le client s'en deduit
  const trouvee = missionDemandee
    ? await une<{ id: string; client_id: string; reference: string; titre: string; budget_fcfa: number | null; statut: StatutMission }>(
        'SELECT id, client_id, reference, titre, budget_fcfa, statut FROM mission WHERE id = $1',
        [missionDemandee],
      )
    : undefined;
  // si l'on vient de choisir un autre client, la mission restee selectionnee ne compte plus
  const mission = trouvee && (!clientId || trouvee.client_id === clientId) ? trouvee : undefined;
  if (mission) clientId = mission.client_id;

  const [clients, client, missions] = await Promise.all([
    requete<{ id: string; raison_sociale: string }>('SELECT id, raison_sociale FROM client ORDER BY lower(raison_sociale)'),
    clientId
      ? une<{ id: string; raison_sociale: string; delai_paiement_jours: number; acompte_pourcent: number; limite_credit_fcfa: number; encours: number }>(
          `SELECT c.id, c.raison_sociale, c.delai_paiement_jours, c.acompte_pourcent, c.limite_credit_fcfa,
                  (SELECT coalesce(sum(montant_fcfa - montant_regle_fcfa), 0) FROM facture f
                    WHERE f.client_id = c.id AND f.statut IN ('emise', 'partielle'))::bigint AS encours
             FROM client c WHERE c.id = $1`,
          [clientId],
        )
      : undefined,
    clientId
      ? requete<{ id: string; reference: string; titre: string; statut: StatutMission }>(
          `SELECT id, reference, titre, statut FROM mission WHERE client_id = $1 AND statut <> 'annulee' ORDER BY cree_le DESC`,
          [clientId],
        )
      : [],
  ]);

  const jour = aujourdhuiBenin();
  const deja = mission
    ? await une<{ acomptes: number; factures: number }>(
        `SELECT coalesce(sum(montant_fcfa) FILTER (WHERE type = 'acompte'), 0)::bigint AS acomptes,
                coalesce(sum(montant_fcfa) FILTER (WHERE type = 'facture'), 0)::bigint AS factures
           FROM facture WHERE mission_id = $1 AND statut <> 'annulee'`,
        [mission.id],
      )
    : undefined;

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/finances/factures" className="text-sm text-marque hover:underline">← Factures</Link>
      <h2 className="text-xl font-bold">Émettre une facture ou un acompte</h2>

      {/* etape 1 : pour qui (formulaire GET : rien n'est enregistre) */}
      <form className="carte grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="etiquette">Client</span>
          <select name="client" defaultValue={clientId ?? ''} className="champ" required>
            <option value="" disabled>Choisir un client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.raison_sociale}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Mission facturée</span>
          <select name="mission" defaultValue={mission?.id ?? ''} className="champ" disabled={!client}>
            <option value="">Aucune (prestation hors mission)</option>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.reference} · {m.titre} ({LIBELLES_STATUT_MISSION[m.statut].toLowerCase()})</option>)}
          </select>
        </label>
        <button className="btn">{client ? 'Changer' : 'Continuer'}</button>
      </form>

      {client && (
        <FormulaireFacture
          clientId={client.id}
          missionId={mission?.id ?? null}
          missionLibelle={mission ? `${mission.reference} · ${mission.titre}` : null}
          aujourdhui={jour}
          suggestions={suggestionsFacture({
            budget: mission?.budget_fcfa ?? null,
            acomptePourcent: client.acompte_pourcent,
            delaiJours: client.delai_paiement_jours,
            acomptesFactures: deja?.acomptes ?? 0,
            facturesEmises: deja?.factures ?? 0,
            aujourdhui: jour,
          })}
          objetDefaut={mission ? mission.titre : ''}
          encours={client.encours}
          limite={client.limite_credit_fcfa}
          rappel={[
            mission?.budget_fcfa ? `Budget de la mission : ${formaterFCFA(mission.budget_fcfa)}` : null,
            deja && (deja.acomptes || deja.factures) ? `déjà facturé : ${formaterFCFA(deja.acomptes + deja.factures)}` : null,
            `conditions du client : ${client.acompte_pourcent ? `acompte de ${client.acompte_pourcent} %, ` : ''}paiement à ${client.delai_paiement_jours} jours`,
          ].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
