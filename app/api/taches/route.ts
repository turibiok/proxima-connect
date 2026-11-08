import { timingSafeEqual } from 'node:crypto';
import { executerTaches } from '@/lib/automatisation/taches';

/**
 * Point d'entree du planificateur (Vercel Cron, chaque heure : vercel.json).
 * Vercel envoie « Authorization: Bearer <CRON_SECRET> » quand la variable
 * CRON_SECRET est definie ; sans elle, la route refuse tout.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const attendu = Buffer.from(`Bearer ${secret}`);
  const recu = Buffer.from(req.headers.get('authorization') ?? '');
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

export async function GET(req: Request) {
  if (!autorise(req)) return new Response('Non autorisé.', { status: 401 });
  const bilan = await executerTaches('planificateur');
  return Response.json(bilan);
}
