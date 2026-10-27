import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { FormulaireIntervenant } from '@/components/FormulaireIntervenant';

export const metadata = { title: 'Nouveau profil' };

export default async function NouveauProfil() {
  await exiger('profil:modifier');
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/intervenants" className="text-sm text-marque hover:underline">← Intervenants</Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Saisir un profil</h1>
      <p className="mb-6 text-sm text-encre-douce">
        Pour une inscription recueillie sur le terrain ou par téléphone. Le consentement de la personne reste obligatoire.
      </p>
      <FormulaireIntervenant mode="interne" />
    </div>
  );
}
