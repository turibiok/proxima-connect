import { FormulaireIntervenant } from '@/components/FormulaireIntervenant';

export const metadata = { title: 'Devenir intervenant' };

export default function Inscription() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Devenez intervenant PROXIMA CONNECT</h1>
        <p className="mt-2 text-encre-douce">
          Distribution, enquêtes, animation, contrôle terrain : recevez des propositions de missions rémunérées près de chez
          vous. L’inscription est gratuite et prend environ 5 minutes.
        </p>
      </div>
      <FormulaireIntervenant mode="public" />
    </div>
  );
}
