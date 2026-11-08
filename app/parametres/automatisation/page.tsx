import { exiger } from '@/lib/auth/session';
import { dateHeure } from '@/lib/format';
import { configFournisseur } from '@/lib/automatisation/regles';
import { adressePublique } from '@/lib/automatisation/envoi';
import { dernieresExecutions } from '@/lib/automatisation/actions';
import { LancementTaches } from './Lancement';

export const metadata = { title: 'Automatisation' };

const LIBELLES_BILAN: Record<string, string> = {
  expirees: 'sans réponse expirées',
  relances: 'relances',
  rappels: 'rappels',
  confirmations: 'confirmations de paiement',
  ajoutes: 'profils sollicités',
  echecs: 'échecs d’envoi',
};

/** Etat de l'automatisation (phase 3) : fournisseur d'envoi, planificateur, dernieres executions. */
export default async function Automatisation() {
  await exiger('parametre:gerer');
  const config = configFournisseur(process.env);
  const [executions, site] = await Promise.all([dernieresExecutions(), adressePublique()]);
  const planificateur = !!process.env.CRON_SECRET;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Automatisation</h1>
        <p className="text-sm text-encre-douce">Sélection des profils et notifications automatiques (phase 3 du cahier des charges).</p>
      </div>

      <section className="carte space-y-2 p-5 text-sm">
        <h2 className="font-bold">Fournisseur d’envoi</h2>
        {config.mode === 'aucun' && (
          <p>
            <span className="puce bg-alerte-pale text-alerte">Aucun</span> Le programme n’envoie rien lui-même : les propositions, rappels et
            confirmations partent depuis le téléphone de l’équipe, comme en phase 2. La sélection automatique ajoute les profils « à proposer ».
          </p>
        )}
        {config.mode === 'simulation' && (
          <p>
            <span className="puce bg-marque-pale text-marque-fonce">Simulation</span> Les envois automatiques sont tracés mais rien ne part. À
            réserver aux essais : en production, les intervenants ne recevraient pas leurs messages.
          </p>
        )}
        {config.mode === 'twilio' && (
          <p>
            <span className="puce bg-ok-pale text-ok">Twilio</span> SMS depuis {config.smsFrom}
            {config.whatsappFrom ? `, WhatsApp depuis ${config.whatsappFrom}` : ' (WhatsApp non configuré)'}.
          </p>
        )}
        {config.mode === 'erreur' && <p className="rounded-lg bg-danger-pale px-3 py-2 text-danger">{config.message}</p>}
        <details className="text-xs text-encre-douce">
          <summary className="cursor-pointer">Configurer l’envoi (variables d’environnement chez l’hébergeur)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><code>COMMUNICATION_FOURNISSEUR</code> : <code>aucun</code> (défaut), <code>simulation</code> ou <code>twilio</code></li>
            <li><code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_SMS_FROM</code> (numéro ou identifiant d’expéditeur)</li>
            <li><code>TWILIO_WHATSAPP_FROM</code> (facultatif) : numéro WhatsApp Business validé par Meta</li>
            <li>
              Réponses des intervenants : dans la console Twilio, webhook « A message comes in » en POST vers{' '}
              <code className="break-all">{site}/api/communication/entrant</code>
            </li>
          </ul>
        </details>
      </section>

      <section className="carte space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Tâches automatiques</h2>
          <span className={planificateur ? 'text-ok' : 'text-alerte'}>
            {planificateur ? 'Planificateur configuré : chaque jour à 7 h (fréquence réglée dans vercel.json)' : 'Planificateur non configuré (variable CRON_SECRET absente)'}
          </span>
        </div>
        <p className="text-encre-douce">
          À chaque passage : relance à mi-délai des propositions sans réponse, puis expiration au terme ; rappel la veille du démarrage ;
          confirmation des paiements versés ; nouvelles propositions sur les missions en sélection automatique.
        </p>
        <LancementTaches />
        {executions.length === 0 ? (
          <p className="text-encre-douce">Aucune exécution pour le moment.</p>
        ) : (
          <ul className="divide-y divide-trait">
            {executions.map((x) => {
              const faits = Object.entries(x.resultat ?? {}).filter(([k, v]) => k in LIBELLES_BILAN && Number(v) > 0);
              return (
                <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    {dateHeure(x.lancee_le)} · {x.declencheur === 'manuel' ? 'à la main' : 'planificateur'}
                    <span className="block text-xs text-encre-douce">
                      {faits.length ? faits.map(([k, v]) => `${v} ${LIBELLES_BILAN[k]}`).join(', ') : 'rien à faire'}
                    </span>
                    {x.erreur && <span className="block text-xs text-danger">{x.erreur}</span>}
                  </span>
                  <span className="text-xs text-encre-douce">{x.duree_ms !== null ? `${(x.duree_ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
