import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { une } from '@/lib/db';
import { valeursBrief } from '@/lib/clients/valeurs';
import { FormulaireBrief } from '@/components/FormulaireBrief';

export const metadata = { title: 'Modifier le brief' };

export default async function ModifierBrief({ params }: { params: Promise<{ id: string }> }) {
  await exiger('client:modifier');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await une<Record<string, any>>(
    'SELECT b.*, c.raison_sociale FROM brief b JOIN client c ON c.id = b.client_id WHERE b.id = $1',
    [id],
  );
  if (!b) notFound();
  if (b.statut !== 'recu') redirect(`/briefs/${id}`);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/briefs/${id}`} className="text-sm text-marque hover:underline">← Brief de {b.raison_sociale}</Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">Modifier le brief</h1>
      <FormulaireBrief clientId={b.client_id} briefId={id} initiales={valeursBrief(b)} />
    </div>
  );
}
