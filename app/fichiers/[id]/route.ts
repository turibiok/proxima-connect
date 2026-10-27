import { contexte } from '@/lib/auth/session';
import { une } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { estImage } from '@/lib/preuves/regles';

/**
 * Sert un fichier de preuve, apres controle des droits.
 *
 * Les en-tetes empechent le navigateur d'interpreter le contenu autrement
 * que comme son type verifie a l'envoi (nosniff), interdisent tout script
 * (CSP) et la mise en cache partagee (private) : ce sont des donnees de
 * terrain, parfois avec des visages.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexte();
  if (!ctx) return new Response('Authentification requise.', { status: 401 });
  if (!ctx.peut('mission:lire')) return new Response('Accès refusé.', { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Introuvable.', { status: 404 });
  const f = await une<{ nom: string; type_mime: string; contenu: Buffer; sha256: string; mission_id: string }>(
    `SELECT f.nom, f.type_mime, f.contenu, f.sha256, p.mission_id
       FROM fichier f JOIN preuve p ON p.id = f.preuve_id WHERE f.id = $1`,
    [id],
  );
  if (!f) return new Response('Introuvable.', { status: 404 });

  // les vignettes d'une page sont chargees ensemble : on ne trace que les
  // telechargements de documents, pas chaque affichage de photo
  if (!estImage(f.type_mime)) {
    await consigner({ utilisateurId: ctx.utilisateur.id, action: 'fichier_telechargement', entite: 'mission', entiteId: f.mission_id, details: { fichier: f.nom } });
  }

  const enLigne = estImage(f.type_mime) || f.type_mime === 'application/pdf';
  return new Response(new Uint8Array(f.contenu), {
    headers: {
      'Content-Type': f.type_mime,
      'Content-Length': String(f.contenu.length),
      'Content-Disposition': `${enLigne ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.nom)}`,
      'Cache-Control': 'private, max-age=3600',
      ETag: `"${f.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
