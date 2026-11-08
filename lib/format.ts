/** Mise en forme des dates a l'heure du Benin, quel que soit le fuseau du serveur. */

const FUSEAU = 'Africa/Porto-Novo';

export function date(d: Date | string | null | undefined): string {
  if (!d) return '-';
  // une colonne `date` arrive en 'AAAA-MM-JJ' : la lire a midi UTC evite
  // qu'un decalage horaire la fasse changer de jour
  const v = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return v.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: FUSEAU });
}

export function dateHeure(d: Date | string): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  });
}

/** « du 3 nov. 2026 au 7 nov. 2026 », « à partir du … », ou « Dates à fixer ». */
export function periode(debut: string | null, fin: string | null): string {
  if (debut && fin) return debut === fin ? `le ${date(debut)}` : `du ${date(debut)} au ${date(fin)}`;
  if (debut) return `à partir du ${date(debut)}`;
  if (fin) return `jusqu’au ${date(fin)}`;
  return 'Dates à fixer';
}

/** 0.3333 -> « 33,3 % » (virgule decimale, espace insecable). */
export function pourcentage(taux: number, decimales = 1): string {
  return `${(taux * 100).toLocaleString('fr-FR', { maximumFractionDigits: decimales })} %`;
}

export function ilYa(d: Date | string): string {
  const jours = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}
