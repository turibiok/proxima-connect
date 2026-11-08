import { ajusterProportions, cadre, CONTOUR_BENIN, dansCadre, projeter, VILLES_REPERES, type Point } from '@/lib/observatoire/regles';

const L = 640;
const H = 420;
const NATIONAL = cadre(CONTOUR_BENIN.map(([lon, lat]) => ({ lon, lat })), 0.04)!;

/**
 * Carte des releves (phase 6), dessinee en SVG sans fond de carte externe.
 * Une seule couleur pour les points : sur un nuage de points, plus de trois
 * couleurs ne se distinguent plus pour un lecteur daltonien ; la repartition
 * par type de mission est donnee dans les tableaux.
 */
export function CarteReleves({ points, zoom }: { points: (Point & { libelle: string })[]; zoom: boolean }) {
  // zoom sur les releves, en gardant la ville repere la plus proche : sans elle, la carte n'a plus de repere
  const centre = points.length ? { lon: points.reduce((t, p) => t + p.lon, 0) / points.length, lat: points.reduce((t, p) => t + p.lat, 0) / points.length } : null;
  const repere = centre ? [...VILLES_REPERES].sort((a, b) => Math.hypot(a.lon - centre.lon, a.lat - centre.lat) - Math.hypot(b.lon - centre.lon, b.lat - centre.lat))[0] : null;
  const c = ajusterProportions(zoom && points.length ? cadre([...points, repere!], 0.15, 0.1)! : NATIONAL, L, H);
  const contour = CONTOUR_BENIN.map(([lon, lat]) => projeter({ lon, lat }, c, L, H))
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  // noms places par ordre d'importance (ordre de VILLES_REPERES) ; un nom qui en chevaucherait un autre est ecarte
  const places: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const villes = VILLES_REPERES.filter((v) => {
    if (!dansCadre(v, c)) return false;
    const p = projeter(v, c, L, H);
    const boite = { x1: p.x - 4, y1: p.y - 10, x2: p.x + 10 + v.nom.length * 6.5, y2: p.y + 6 };
    if (places.some((b) => boite.x1 < b.x2 && boite.x2 > b.x1 && boite.y1 < b.y2 && boite.y2 > b.y1)) return false;
    places.push(boite);
    return true;
  });
  return (
    <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Carte de ${points.length} point${points.length > 1 ? 's' : ''} relevé${points.length > 1 ? 's' : ''}`} className="h-auto w-full rounded-lg bg-papier">
      <path d={`${contour} Z`} fill="#ffffff" stroke="#dfe3ec" strokeWidth={2} strokeLinejoin="round" />
      {villes.map((v) => {
        const p = projeter(v, c, L, H);
        return (
          <g key={v.nom}>
            <rect x={p.x - 3} y={p.y - 3} width={6} height={6} fill="#55627a" />
            <text x={p.x + 7} y={p.y + 4} fontSize={12} fill="#55627a">{v.nom}</text>
          </g>
        );
      })}
      {points.map((pt, i) => {
        const p = projeter(pt, c, L, H);
        // anneau de la couleur du fond : les points superposes restent distincts
        return (
          <circle key={i} cx={p.x} cy={p.y} r={5} fill="#1d4ed8" stroke="#ffffff" strokeWidth={2}>
            <title>{pt.libelle}</title>
          </circle>
        );
      })}
    </svg>
  );
}

/**
 * Activite par mois : une seule serie par graphique (jamais deux echelles),
 * valeur au survol de chaque barre, tableau des donnees a la suite.
 */
export function BarresMensuelles({ titre, serie, unite }: { titre: string; serie: { mois: string; libelle: string; total: number }[]; unite: string }) {
  const max = Math.max(1, ...serie.map((s) => s.total));
  const largeur = 100 / serie.length;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-bold">{titre}</figcaption>
      <svg viewBox="0 0 600 160" role="img" aria-label={titre} className="h-auto w-full">
        <line x1={0} y1={140} x2={600} y2={140} stroke="#dfe3ec" strokeWidth={1} />
        {serie.map((s, i) => {
          const h = (s.total / max) * 120;
          const x = (i * largeur * 600) / 100;
          const w = (largeur * 600) / 100 - 2; // 2 px d'ecart entre barres
          const r = Math.min(4, h / 2, w / 2); // extremite arrondie, sans deformer une barre basse
          return (
            <g key={s.mois}>
              {/* zone de survol plus grande que la barre */}
              <rect x={x} y={0} width={w + 2} height={160} fill="transparent">
                <title>{`${s.libelle} : ${s.total} ${unite}`}</title>
              </rect>
              {s.total > 0 && (
                <path
                  d={`M${x},140 v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} Z`}
                  fill="#1d4ed8"
                  pointerEvents="none"
                />
              )}
              {i % 2 === serie.length % 2 && (
                <text x={x + w / 2} y={156} fontSize={11} textAnchor="middle" fill="#55627a">{s.libelle}</text>
              )}
            </g>
          );
        })}
        <text x={2} y={12} fontSize={11} fill="#55627a">{max} {unite}</text>
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-encre-douce">Voir les données</summary>
        <table className="mt-1 w-full max-w-sm">
          <tbody className="divide-y divide-trait">
            {serie.map((s) => (
              <tr key={s.mois}>
                <td className="py-0.5">{s.libelle}</td>
                <td className="py-0.5 text-right tabular-nums">{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
