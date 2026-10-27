import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { responsables } from '@/lib/missions/donnees';
import { valeursDepuisBrief } from '@/lib/missions/valeurs';
import { FormulaireMission } from '@/components/FormulaireMission';

export const metadata = { title: 'Nouvelle mission' };

/**
 * Creation d'une mission. Le cas normal part d'un brief (?brief=…), dont les
 * champs pre-remplissent le formulaire ; sans brief, on choisit le client.
 */
export default async function NouvelleMission({ searchParams }: { searchParams: Promise<{ brief?: string }> }) {
  const ctx = await exiger('mission:modifier');
  const { brief: briefId } = await searchParams;

  const brief = briefId && /^[0-9a-f-]{36}$/i.test(briefId)
    ? await une<Record<string, any>>(
        'SELECT b.*, c.raison_sociale FROM brief b JOIN client c ON c.id = b.client_id WHERE b.id = $1',
        [briefId],
      )
    : undefined;
  if (brief && brief.statut !== 'recu') redirect(`/briefs/${brief.id}`);

  const [listeResponsables, clients] = await Promise.all([
    responsables(),
    brief ? Promise.resolve(undefined) : requete<{ id: string; raison_sociale: string }>('SELECT id, raison_sociale FROM client ORDER BY raison_sociale'),
  ]);
  const proposeResponsable = listeResponsables.some((r) => r.id === ctx.utilisateur.id) ? ctx.utilisateur.id : '';

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={brief ? `/briefs/${brief.id}` : '/missions'} className="text-sm text-marque hover:underline">
        ← {brief ? `Brief de ${brief.raison_sociale}` : 'Missions'}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Nouvelle mission</h1>
      <p className="mb-6 text-sm text-encre-douce">
        {brief
          ? 'Reprise du brief : complétez au moins la rémunération par intervenant. Le brief passera « converti ».'
          : 'Sans brief : choisissez le client. Dans la plupart des cas, partez plutôt du brief saisi par le commercial.'}
      </p>
      <FormulaireMission
        missionId={null}
        briefId={brief?.id ?? null}
        clients={clients}
        responsables={listeResponsables}
        initiales={{ ...(brief ? valeursDepuisBrief(brief) : {}), responsable_id: proposeResponsable }}
        annuler={brief ? `/briefs/${brief.id}` : '/missions'}
      />
    </div>
  );
}
