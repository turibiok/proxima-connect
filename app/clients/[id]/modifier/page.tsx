import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { une } from '@/lib/db';
import { valeursClient } from '@/lib/clients/valeurs';
import { FormulaireClient } from '@/components/FormulaireClient';

export const metadata = { title: 'Modifier le client' };

export default async function ModifierClient({ params }: { params: Promise<{ id: string }> }) {
  await exiger('client:modifier');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await une<Record<string, any>>('SELECT * FROM client WHERE id = $1', [id]);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/clients/${id}`} className="text-sm text-marque hover:underline">← {c.raison_sociale}</Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">Modifier la fiche client</h1>
      <FormulaireClient id={id} initiales={valeursClient(c)} />
    </div>
  );
}
