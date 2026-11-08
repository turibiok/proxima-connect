import { NextResponse, type NextRequest } from 'next/server';

/**
 * Confort de navigation : renvoie vers la connexion quand aucun cookie de
 * session n'est present. Ce n'est PAS le controle d'acces : le middleware ne
 * lit pas la base. Les pages et les actions revalident la session et les
 * droits cote serveur (lib/auth/session.ts).
 */

// /espace : espace des intervenants, avec sa propre session (lib/espace/session.ts)
// /api/taches et /api/communication/entrant : planificateur et fournisseur
// d'envoi, authentifies par leur secret ou leur signature
// /client : espace des clients, avec sa propre session (lib/client/session.ts)
// /demarrage, /hors-ligne : application installable (aiguillage, page sans reseau)
const PUBLIC = ['/connexion', '/inscription', '/acces-refuse', '/espace', '/client', '/demarrage', '/hors-ligne', '/api/taches', '/api/communication/entrant'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.get('px_session')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // fichiers publics de l'application installable : manifeste, service worker, icones
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|manifest.webmanifest|sw.js|icone-.*\.png|apple-touch-icon.png).*)'],
};
