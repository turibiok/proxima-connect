import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { une } from '@/lib/db';
import { FormulaireBrief } from '@/components/FormulaireBrief';

export const metadata = { title: 'Nouveau brief' };

export default async function NouveauBrief({ params }: { params: Promise<{ id: string }> }) {
  await exiger('client:modifier');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await une<{ raison_sociale: string }>('SELECT raison_sociale FROM client WHERE id = $1', [id]);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/clients/${id}`} className="text-sm text-marque hover:underline">← {c.raison_sociale}</Link>
      <h1 className="mt-2 text-2xl font-bold">Nouveau brief</h1>
      <p className="mb-6 text-sm text-encre-douce">Demande de {c.raison_sociale}. Elle servira de base à la mission.</p>
      <FormulaireBrief clientId={id} briefId={null} />
    </div>
  );
}
