'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { EntreeMenu } from '@/lib/auth/roles';

export function Menu({ entrees }: { entrees: EntreeMenu[] }) {
  const chemin = usePathname();
  const actif = (href: string) => (href === '/' ? chemin === '/' : chemin.startsWith(href));
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {entrees.map((e) =>
        e.bientot ? (
          <span
            key={e.href}
            title="Module prévu dans un prochain lot"
            className="cursor-default whitespace-nowrap rounded-md px-3 py-1.5 text-encre-douce/50"
          >
            {e.libelle}
          </span>
        ) : (
          <Link
            key={e.href}
            href={e.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
              actif(e.href) ? 'bg-marque-pale text-marque-fonce' : 'text-encre-douce hover:bg-papier hover:text-encre'
            }`}
          >
            {e.libelle}
          </Link>
        ),
      )}
    </nav>
  );
}
