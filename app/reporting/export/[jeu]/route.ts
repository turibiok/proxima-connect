import { contexte } from '@/lib/auth/session';
import { requete } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { aujourdhuiBenin } from '@/lib/finances/regles';
import { versCsv } from '@/lib/reporting/regles';
import { JEUX } from '@/lib/reporting/exports';

/**
 * Telechargement d'un jeu de donnees en CSV, apres controle des droits.
 * Chaque export est inscrit au journal : un fichier sorti du programme
 * echappe ensuite a ses controles d'acces.
 */
export async function GET(_: Request, { params }: { params: Promise<{ jeu: string }> }) {
  const ctx = await contexte();
  if (!ctx || ctx.utilisateur.mdp_provisoire) return new Response('Authentification requise.', { status: 401 });
  const { jeu } = await params;
  const j = Object.hasOwn(JEUX, jeu) ? JEUX[jeu] : null;
  if (!j) return new Response('Export inconnu.', { status: 404 });
  if (!ctx.peut('tableau:lire') || !ctx.peut(j.droit)) return new Response('Accès refusé.', { status: 403 });

  const lignes = await requete<Record<string, any>>(j.sql);
  await consigner({ utilisateurId: ctx.utilisateur.id, action: 'export_donnees', entite: 'export', entiteId: jeu, details: { jeu: j.libelle, lignes: lignes.length } });

  return new Response(versCsv(j.colonnes, lignes), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="proxima-${jeu}-${aujourdhuiBenin()}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
