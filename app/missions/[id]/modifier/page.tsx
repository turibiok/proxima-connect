import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { chargerMission, responsables } from '@/lib/missions/donnees';
import { valeursMission } from '@/lib/missions/valeurs';
import { FormulaireMission } from '@/components/FormulaireMission';

export const metadata = { title: 'Modifier la mission' };

export default async function ModifierMission({ params }: { params: Promise<{ id: string }> }) {
  await exiger('mission:modifier');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await chargerMission(id);
  if (!m) notFound();
  if (['annulee', 'payee'].includes(m.statut)) redirect(`/missions/${id}`);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/missions/${id}`} className="text-sm text-marque hover:underline">← {m.reference}</Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Modifier la mission</h1>
      <p className="mb-6 text-sm text-encre-douce">
        Les propositions déjà envoyées gardent les conditions annoncées : prévenez les intervenants concernés d’un changement.
      </p>
      <FormulaireMission missionId={id} briefId={null} responsables={await responsables()} initiales={valeursMission(m)} annuler={`/missions/${id}`} />
    </div>
  );
}
