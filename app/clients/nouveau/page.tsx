import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { FormulaireClient } from '@/components/FormulaireClient';

export const metadata = { title: 'Nouveau client' };

export default async function NouveauClient() {
  await exiger('client:modifier');
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/clients" className="text-sm text-marque hover:underline">← Clients</Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">Nouveau client</h1>
      <FormulaireClient id={null} />
    </div>
  );
}
