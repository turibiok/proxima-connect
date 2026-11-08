import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { contexte } from '@/lib/auth/session';
import { MENU, ROLES } from '@/lib/auth/roles';
import { Menu } from '@/components/Menu';
import { seDeconnecter } from './actions-session';
import { EnregistrementServiceWorker } from '@/components/ApplicationInstallable';

export const metadata: Metadata = {
  title: { default: 'PROXIMA CONNECT', template: '%s · PROXIMA CONNECT' },
  description: 'Gestion du vivier d’intervenants, des clients et des missions terrain.',
  // application installable (phase 4) : icone et barre d'etat sur iPhone
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'PROXIMA', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1d4ed8' };

export default async function Racine({ children }: { children: React.ReactNode }) {
  const ctx = await contexte();
  const menu = ctx ? MENU.filter((e) => !e.droit || ctx.peut(e.droit)) : [];

  return (
    <html lang="fr">
      <body>
        <header className="sticky top-0 z-20 border-b border-trait bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href={ctx ? '/' : '/inscription'} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-marque">
                <span className="h-3.5 w-3.5 rounded-full border-[3px] border-white" />
              </span>
              <span className="text-[15px] font-extrabold tracking-tight">
                PROXIMA <span className="text-marque">CONNECT</span>
              </span>
            </Link>
            {ctx && (
              <>
                <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
                  <Menu entrees={menu} />
                </div>
                <div className="ml-auto flex items-center gap-3 sm:ml-0">
                  <Link href="/compte/mot-de-passe" title="Changer de mot de passe" className="text-right text-xs leading-tight hover:underline">
                    <div className="font-semibold">{ctx.utilisateur.nom_complet}</div>
                    <div className="text-encre-douce">{ROLES[ctx.utilisateur.role].libelle}</div>
                  </Link>
                  <form action={seDeconnecter}>
                    <button className="btn px-3 py-1.5 text-xs">Déconnexion</button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <EnregistrementServiceWorker />
      </body>
    </html>
  );
}
