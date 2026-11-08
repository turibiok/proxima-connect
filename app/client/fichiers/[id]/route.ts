import { une } from '@/lib/db';
import { compteCourant } from '@/lib/client/session';

/**
 * Photos du rapport, pour l'espace client (phase 4). Seulement les photos
 * validees (donc consenties) d'une mission de cette entreprise dont le
 * rapport a ete transmis : rien d'autre n'est accessible.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const k = await compteCourant();
  if (!k || k.mdp_provisoire) return new Response('Authentification requise.', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Introuvable.', { status: 404 });
  const f = await une<{ type_mime: string; contenu: Buffer; sha256: string }>(
    `SELECT f.type_mime, f.contenu, f.sha256
       FROM fichier f JOIN preuve p ON p.id = f.preuve_id JOIN mission m ON m.id = p.mission_id
      WHERE f.id = $1 AND m.client_id = $2 AND m.rapport_transmis_le IS NOT NULL
        AND p.statut = 'validee' AND p.type = 'photo' AND f.type_mime LIKE 'image/%'`,
    [id, k.client_id],
  );
  if (!f) return new Response('Introuvable.', { status: 404 });
  return new Response(new Uint8Array(f.contenu), {
    headers: {
      'Content-Type': f.type_mime,
      'Content-Length': String(f.contenu.length),
      'Cache-Control': 'private, max-age=3600',
      ETag: `"${f.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
