'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Onglets d'une rubrique : le premier n'est actif que sur sa page exacte, les autres aussi sur leurs sous-pages. */
export function Onglets({ liens }: { liens: { href: string; libelle: string }[] }) {
  const chemin = usePathname();
  const actif = (href: string, i: number) => (i === 0 ? chemin === href : chemin === href || chemin.startsWith(`${href}/`));
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-trait text-sm [scrollbar-width:none]">
      {liens.map((l, i) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={actif(l.href, i) ? 'page' : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium ${
            actif(l.href, i) ? 'border-marque text-marque-fonce' : 'border-transparent text-encre-douce hover:text-encre'
          }`}
        >
          {l.libelle}
        </Link>
      ))}
    </nav>
  );
}
