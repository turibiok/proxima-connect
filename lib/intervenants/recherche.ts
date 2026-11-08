/**
 * Recherche multicritere des profils (cahier des charges 5.1).
 *
 * Construit la clause WHERE et ses parametres a partir des filtres de l'URL.
 * Module pur : la requete produite est verifiee par les tests sans base.
 * Aucune valeur saisie n'est concatenee dans le SQL : tout passe en parametre.
 */

export interface Filtres {
  q?: string;
  statut?: string;
  ville?: string;
  /** nom du departement, ou « inconnu » : ville non reconnue par le referentiel */
  departement?: string;
  zone?: string;
  competence?: string;
  categorie?: string;
  jour?: string;
  score_min?: string;
}

export const CLES_FILTRES: (keyof Filtres)[] = ['q', 'statut', 'ville', 'departement', 'zone', 'competence', 'categorie', 'jour', 'score_min'];

export function lireFiltres(sp: Record<string, string | string[] | undefined>): Filtres {
  const f: Filtres = {};
  for (const k of CLES_FILTRES) {
    const v = sp[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    if (s) f[k] = s.slice(0, 100);
  }
  return f;
}

export function clauseRecherche(f: Filtres): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  // insensible a la casse et aux accents simples : « fidjrosse » trouve « Fidjrossè »
  const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  if (f.q) {
    const chiffres = f.q.replace(/\D/g, '');
    const motif = p(`%${f.q.toLowerCase()}%`);
    const alternatives = [
      `lower(i.nom || ' ' || i.prenoms) LIKE ${motif}`,
      `lower(i.prenoms || ' ' || i.nom) LIKE ${motif}`,
      `lower(i.reference) LIKE ${motif}`,
    ];
    // 4 chiffres au moins : on cherche aussi dans les telephones
    if (chiffres.length >= 4) alternatives.push(`i.telephone LIKE ${p(`%${chiffres}%`)}`);
    conditions.push(`(${alternatives.join(' OR ')})`);
  }
  if (f.statut) conditions.push(`i.statut = ${p(f.statut)}`);
  if (f.ville) conditions.push(`lower(i.ville) = ${p(f.ville.toLowerCase())}`);
  if (f.departement) conditions.push(f.departement === 'inconnu' ? 'i.departement IS NULL' : `i.departement = ${p(f.departement)}`);
  if (f.zone) {
    const z = p(`%${sansAccent(f.zone)}%`);
    conditions.push(
      `(translate(lower(i.ville || ' ' || coalesce(i.quartier, '') || ' ' || array_to_string(i.zones, ' ')),
                  'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') LIKE ${z})`,
    );
  }
  if (f.competence) {
    conditions.push(`EXISTS (SELECT 1 FROM unnest(i.competences) c WHERE lower(c) LIKE ${p(`%${f.competence.toLowerCase()}%`)})`);
  }
  if (f.categorie) conditions.push(`${p(f.categorie)} = ANY (i.categories_missions)`);
  if (f.jour) conditions.push(`${p(f.jour)} = ANY (i.jours_disponibles)`);
  if (f.score_min && Number.isFinite(Number(f.score_min))) {
    conditions.push(`i.score >= ${p(Number(f.score_min))}`);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}
