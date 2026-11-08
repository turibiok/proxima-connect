/**
 * Referentiel geographique du Benin (phase 5 : extension geographique) :
 * 12 departements, 77 communes. Meme liste que la table `commune` de la
 * migration 013 : toute modification se fait aux deux endroits, ce que
 * verifie tests/geographie.test.mjs.
 */

export interface Departement {
  nom: string;
  chefLieu: string;
  communes: string[];
}

export const DEPARTEMENTS: Departement[] = [
  { nom: 'Alibori', chefLieu: 'Kandi', communes: ['Banikoara', 'Gogounou', 'Kandi', 'Karimama', 'Malanville', 'Ségbana'] },
  { nom: 'Atacora', chefLieu: 'Natitingou', communes: ['Boukoumbé', 'Cobly', 'Kérou', 'Kouandé', 'Matéri', 'Natitingou', 'Péhunco', 'Tanguiéta', 'Toucountouna'] },
  { nom: 'Atlantique', chefLieu: 'Allada', communes: ['Abomey-Calavi', 'Allada', 'Kpomassè', 'Ouidah', 'Sô-Ava', 'Toffo', 'Tori-Bossito', 'Zè'] },
  { nom: 'Borgou', chefLieu: 'Parakou', communes: ['Bembèrèkè', 'Kalalé', 'N\'Dali', 'Nikki', 'Parakou', 'Pèrèrè', 'Sinendé', 'Tchaourou'] },
  { nom: 'Collines', chefLieu: 'Dassa-Zoumè', communes: ['Bantè', 'Dassa-Zoumè', 'Glazoué', 'Ouèssè', 'Savalou', 'Savè'] },
  { nom: 'Couffo', chefLieu: 'Aplahoué', communes: ['Aplahoué', 'Djakotomey', 'Dogbo', 'Klouékanmè', 'Lalo', 'Toviklin'] },
  { nom: 'Donga', chefLieu: 'Djougou', communes: ['Bassila', 'Copargo', 'Djougou', 'Ouaké'] },
  { nom: 'Littoral', chefLieu: 'Cotonou', communes: ['Cotonou'] },
  { nom: 'Mono', chefLieu: 'Lokossa', communes: ['Athiémé', 'Bopa', 'Comè', 'Grand-Popo', 'Houéyogbé', 'Lokossa'] },
  { nom: 'Ouémé', chefLieu: 'Porto-Novo', communes: ['Adjarra', 'Adjohoun', 'Aguégués', 'Akpro-Missérété', 'Avrankou', 'Bonou', 'Dangbo', 'Porto-Novo', 'Sèmè-Kpodji'] },
  { nom: 'Plateau', chefLieu: 'Pobè', communes: ['Adja-Ouèrè', 'Ifangni', 'Kétou', 'Pobè', 'Sakété'] },
  { nom: 'Zou', chefLieu: 'Abomey', communes: ['Abomey', 'Agbangnizoun', 'Bohicon', 'Covè', 'Djidja', 'Ouinhi', 'Za-Kpota', 'Zagnanado', 'Zogbodomey'] },
];

/** Variantes et quartiers courants rattaches a une commune. */
export const ALIAS_COMMUNES: Record<string, string> = {
  'Sèmè-Podji': 'Sèmè-Kpodji',
  'Seme': 'Sèmè-Kpodji',
  'Calavi': 'Abomey-Calavi',
  'Godomey': 'Abomey-Calavi',
  'Akassato': 'Abomey-Calavi',
  'Togba': 'Abomey-Calavi',
  'Ouèdo': 'Abomey-Calavi',
  'Cocotomey': 'Abomey-Calavi',
  'Dassa': 'Dassa-Zoumè',
  'Dogbo-Tota': 'Dogbo',
  'Ndali': 'N\'Dali',
  'Tori': 'Tori-Bossito',
  'So-Ava': 'Sô-Ava',
  'Missérété': 'Akpro-Missérété',
  'Ekpè': 'Sèmè-Kpodji',
  'Agblangandan': 'Sèmè-Kpodji',
  'Kandi-Fô': 'Kandi',
  'Pahou': 'Ouidah',
  'Glo-Djigbé': 'Abomey-Calavi',
  'Akpakpa': 'Cotonou',
  'Cadjèhoun': 'Cotonou',
  'Fidjrossè': 'Cotonou',
  'Gbégamey': 'Cotonou',
  'Agla': 'Cotonou',
  'Dantokpa': 'Cotonou',
  'Ganhi': 'Cotonou',
  'Zogbo': 'Cotonou',
  'Haie Vive': 'Cotonou',
  'Ouando': 'Porto-Novo',
  'Banikanni': 'Parakou',
};

/** Toutes les communes, par ordre alphabetique (listes de suggestion). */
export const COMMUNES: string[] = DEPARTEMENTS.flatMap((d) => d.communes).sort((a, b) => a.localeCompare(b, 'fr'));

/** Departement d'une commune du referentiel. */
export function departementDe(commune: string | null | undefined): string | null {
  if (!commune) return null;
  return DEPARTEMENTS.find((d) => d.communes.includes(commune))?.nom ?? null;
}

/** Cle de comparaison : minuscules, sans accents, toute ponctuation en espace (identique a cle_geo en SQL). */
export function cleGeo(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Commune reconnue dans un texte libre (« Cotonou : Dantokpa, Ganhi »,
 * « Calavi », « Sèmè-Podji ») : la correspondance la plus longue gagne
 * (« Abomey-Calavi » plutot que « Abomey »). Meme regle que localiser_commune en SQL.
 */
export function localiserCommune(texte: string | null | undefined): string | null {
  const t = ` ${cleGeo(texte)} `;
  const candidats = [
    ...DEPARTEMENTS.flatMap((d) => d.communes.map((c) => [cleGeo(c), c] as const)),
    ...Object.entries(ALIAS_COMMUNES).map(([a, c]) => [cleGeo(a), c] as const),
  ].filter(([k]) => t.includes(` ${k} `));
  candidats.sort((a, b) => b[0].length - a[0].length);
  return candidats[0]?.[1] ?? null;
}
