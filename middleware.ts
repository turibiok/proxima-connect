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
const PUBLIC = ['/connexion', '/inscription', '/acces-refuse', '/espace', '/api/taches', '/api/communication/entrant'];

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
