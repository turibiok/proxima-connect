import { une } from '@/lib/db';
import { exigerIntervenant } from '@/lib/espace/session';
import { SectionScore } from '@/app/intervenants/[id]/Score';

export const metadata = { title: 'Mon score' };

/** Le score de l'intervenant, explique comme a l'equipe : criteres, evolution, evaluations (5.5, transparence). */
export default async function ScoreEspace() {
  const i = await exigerIntervenant();
  const p = await une<{ score: number | null }>('SELECT score FROM intervenant WHERE id = $1', [i.id]);
  return <SectionScore intervenantId={i.id} score={p?.score ?? null} ctx={null} vue="intervenant" />;
}
