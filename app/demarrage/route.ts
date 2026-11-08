import { cookies } from 'next/headers';
import { COOKIE_SESSION } from '@/lib/auth/session';

/**
 * Point de depart de l'application installee : l'equipe va au tableau de
 * bord, un client a son espace, un intervenant au sien.
 *
 * Les sessions client et intervenant ont des cookies limites a leurs chemins
 * (/client, /espace), invisibles ici : a la connexion, chaque espace pose un
 * repere sans valeur d'acces (`px_profil`) qui sert seulement d'aiguillage.
 * Chaque espace revalide ensuite sa propre session.
 */
export const dynamic = 'force-dynamic';

const COOKIE_PROFIL = 'px_profil';

export async function GET(req: Request) {
  const jar = await cookies();
  const cible = jar.get(COOKIE_SESSION) ? '/' : jar.get(COOKIE_PROFIL)?.value === 'client' ? '/client' : '/espace';
  return Response.redirect(new URL(cible, req.url), 302);
}
