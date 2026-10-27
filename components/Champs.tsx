/** Briques de formulaire partagees : section numerotee, champ etiquete, bandeau d'erreurs. */

export function Section({ numero, titre, children }: { numero?: number; titre: string; children: React.ReactNode }) {
  return (
    <section className="carte space-y-4 p-5">
      <h2 className="flex items-center gap-2.5 text-base font-bold">
        {numero !== undefined && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-marque-pale text-xs text-marque-fonce">{numero}</span>
        )}
        {titre}
      </h2>
      {children}
    </section>
  );
}

export function Champ(p: {
  nom: string;
  libelle: string;
  erreur?: string;
  aide?: string;
  facultatif?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={p.className}>
      <label htmlFor={p.nom} className="etiquette">
        {p.libelle}
        {p.facultatif && <span className="font-normal text-encre-douce"> (facultatif)</span>}
      </label>
      {p.children}
      {p.erreur ? <p className="erreur">{p.erreur}</p> : p.aide ? <p className="aide">{p.aide}</p> : null}
    </div>
  );
}

export function BandeauErreurs({ erreurs }: { erreurs: Record<string, string> }) {
  const n = Object.keys(erreurs).length;
  if (!n) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-pale px-4 py-3 text-sm text-danger">
      <strong>Le formulaire contient {n} erreur{n > 1 ? 's' : ''}.</strong> Corrigez les champs signalés en rouge.
    </div>
  );
}
