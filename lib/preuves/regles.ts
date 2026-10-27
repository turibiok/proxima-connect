/**
 * Regles des preuves d'execution et du controle terrain (cahier des charges 5.4).
 *
 * Module pur, teste par tests/preuves.test.mjs.
 */

// ------------------------------------------------------------ referentiels

export type TypePreuve = 'formulaire' | 'photo' | 'geopoint' | 'signature' | 'contre_appel' | 'autre';

export const TYPES_PREUVE: Record<TypePreuve, { libelle: string; aide: string }> = {
  photo: { libelle: 'Photos', aide: 'Photos prises sur le terrain, avec l’accord des personnes visibles.' },
  geopoint: { libelle: 'Géopoint', aide: 'Position relevée sur place, au téléphone.' },
  formulaire: { libelle: 'Formulaire de mission', aide: 'Fiche remplie ou fichier importé (CSV, Excel, PDF).' },
  signature: { libelle: 'Signature', aide: 'Signature du responsable de point de vente, du bénéficiaire…' },
  contre_appel: { libelle: 'Contre-appel', aide: 'Appel de vérification auprès d’une personne rencontrée.' },
  autre: { libelle: 'Autre', aide: 'Toute autre pièce justificative.' },
};

export type StatutPreuve = 'en_attente' | 'validee' | 'rejetee';

export const STATUTS_PREUVE: Record<StatutPreuve, string> = {
  en_attente: 'À contrôler',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

export const RESULTATS_CONTRE_APPEL = {
  confirme: 'Passage confirmé',
  non_confirme: 'Passage non confirmé',
  injoignable: 'Injoignable',
} as const;

export const TYPES_CONTROLE = [
  'Visite terrain inopinée',
  'Vérification des données',
  'Contrôle des photos',
  'Contre-appels par échantillon',
  'Retour du client',
  'Autre',
];

export const RESULTATS_CONTROLE = {
  conforme: 'Conforme',
  reserve: 'Conforme avec réserves',
  non_conforme: 'Non conforme',
} as const;

export const GRAVITES = {
  faible: 'Faible',
  moyenne: 'Moyenne',
  elevee: 'Élevée',
  critique: 'Critique',
} as const;
export type Gravite = keyof typeof GRAVITES;

/** Un incident de gravite elevee ou critique doit etre resolu avant de declarer la mission controlee. */
export const bloquant = (g: Gravite) => g === 'elevee' || g === 'critique';

// ------------------------------------------------------------ fichiers

export const TAILLE_MAX = 8 * 1024 * 1024;
export const FICHIERS_MAX = 10;

/**
 * Type reel d'un fichier, lu dans ses premiers octets — jamais d'apres son nom
 * ou ce que declare le navigateur, qu'un envoi malveillant choisit librement.
 * Les formats acceptes sont ceux qu'on sait servir sans risque : pas de SVG
 * (il peut contenir du script), pas de HTML.
 */
export function typeReel(octets: Uint8Array, nom: string): string | null {
  const debut = (n: number) => [...octets.slice(0, n)];
  const egal = (sig: number[], decalage = 0) => sig.every((b, i) => octets[decalage + i] === b);
  if (egal([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (egal([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (egal([0x52, 0x49, 0x46, 0x46]) && egal([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (egal([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  // xlsx = archive zip ; on ne l'accepte que sous ce nom
  if (egal([0x50, 0x4b, 0x03, 0x04]) && /\.xlsx$/i.test(nom)) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  // CSV : texte sans octet nul ni balise, sous ce nom
  if (/\.csv$/i.test(nom) && !debut(4096).includes(0) && !/<\s*(script|html|svg)/i.test(new TextDecoder().decode(octets.slice(0, 4096)))) {
    return 'text/csv';
  }
  return null;
}

export const estImage = (mime: string) => mime.startsWith('image/');

/** Nom de fichier assaini pour l'en-tete Content-Disposition et l'affichage. */
export function nomPropre(nom: string): string {
  const base = (nom || 'fichier').split(/[\\/]/).pop()!;
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'fichier';
}

/** Nombre de lignes de donnees d'un CSV (en-tete exclu, lignes vides ignorees). */
export function lignesCsv(texte: string): number {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
  return Math.max(0, lignes.length - 1);
}

// ------------------------------------------------------------ geopoints

/** Cadre du Benin, avec une marge : un point hors de ce cadre merite un second regard. */
const BENIN = { latMin: 6.0, latMax: 12.6, lonMin: 0.6, lonMax: 4.0 };

export function lireCoordonnees(lat: string, lon: string): { ok: true; latitude: number; longitude: number; horsBenin: boolean } | { ok: false; erreur: string } {
  const la = Number(String(lat).replace(',', '.'));
  const lo = Number(String(lon).replace(',', '.'));
  if (!String(lat).trim() || !String(lon).trim() || !Number.isFinite(la) || !Number.isFinite(lo)) {
    return { ok: false, erreur: 'Latitude et longitude sont nécessaires (ex. 6.3654, 2.4183).' };
  }
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return { ok: false, erreur: 'Coordonnées impossibles.' };
  const horsBenin = la < BENIN.latMin || la > BENIN.latMax || lo < BENIN.lonMin || lo > BENIN.lonMax;
  return { ok: true, latitude: Math.round(la * 1e6) / 1e6, longitude: Math.round(lo * 1e6) / 1e6, horsBenin };
}

export function lienCarte(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

// ------------------------------------------------------------ saisie d'une preuve

interface FormLike {
  get(k: string): unknown;
}

export interface SaisiePreuve {
  type: TypePreuve;
  intervenant_id: string | null;
  description: string | null;
  realisee_le: string | null;
  latitude: number | null;
  longitude: number | null;
  precision_m: number | null;
  consentement_photo: boolean | null;
  donnees: Record<string, unknown> | null;
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Lit les champs d'une preuve (hors fichiers). `nbFichiers` : nombre de
 * fichiers acceptes, pour les types qui en exigent.
 */
export function lirePreuve(f: FormLike, nbFichiers: number): { ok: true; donnees: SaisiePreuve } | { ok: false; erreurs: Record<string, string> } {
  const t = (k: string, max = 500) => String(f.get(k) ?? '').trim().slice(0, max);
  const erreurs: Record<string, string> = {};
  const type = t('type') as TypePreuve;
  if (!(type in TYPES_PREUVE)) return { ok: false, erreurs: { type: 'Choisissez le type de preuve.' } };

  const intervenant = t('intervenant_id');
  const realisee = t('realisee_le');
  if (realisee && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(realisee)) erreurs.realisee_le = 'Date invalide.';

  const d: SaisiePreuve = {
    type,
    intervenant_id: UUID.test(intervenant) ? intervenant : null,
    description: t('description', 2000) || null,
    realisee_le: realisee || null,
    latitude: null,
    longitude: null,
    precision_m: null,
    consentement_photo: null,
    donnees: null,
  };

  // une position peut accompagner tout type de preuve ; elle est exigee pour un geopoint
  const lat = t('latitude');
  const lon = t('longitude');
  if (lat || lon || type === 'geopoint') {
    const c = lireCoordonnees(lat, lon);
    if (!c.ok) erreurs.latitude = c.erreur;
    else {
      d.latitude = c.latitude;
      d.longitude = c.longitude;
      const precision = Number(t('precision_m'));
      d.precision_m = t('precision_m') && Number.isFinite(precision) && precision >= 0 ? Math.round(precision * 10) / 10 : null;
      if (c.horsBenin) d.donnees = { ...d.donnees, hors_benin: true };
    }
  }

  switch (type) {
    case 'photo':
      if (!nbFichiers) erreurs.fichiers = 'Ajoutez au moins une photo.';
      if (f.get('consentement_photo') !== 'oui') {
        erreurs.consentement_photo = 'Confirmez que les personnes reconnaissables ont donné leur accord, ou qu’il n’y en a pas.';
      }
      d.consentement_photo = true;
      break;
    case 'signature':
      if (!nbFichiers) erreurs.fichiers = 'La signature est vide.';
      d.donnees = { ...d.donnees, signataire: t('signataire', 120) || null, qualite: t('qualite', 120) || null };
      if (!t('signataire')) erreurs.signataire = 'Indiquez qui a signé.';
      break;
    case 'contre_appel': {
      const resultat = t('resultat');
      if (!(resultat in RESULTATS_CONTRE_APPEL)) erreurs.resultat = 'Indiquez le résultat de l’appel.';
      if (!t('appele')) erreurs.appele = 'Indiquez la personne appelée.';
      d.donnees = { ...d.donnees, appele: t('appele', 120), telephone: t('telephone_appele', 40) || null, resultat };
      break;
    }
    case 'formulaire':
    case 'autre':
      if (!nbFichiers && !d.description) erreurs.description = 'Joignez un fichier ou décrivez la preuve.';
      break;
  }

  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, donnees: d };
}

// ------------------------------------------------------------ bilan du controle

export interface Bilan {
  validees: number;
  enAttente: number;
  rejetees: number;
  incidentsBloquants: number;
}

/** Part des preuves rejetees parmi celles controlees. Cible : moins de 5 % (cahier des charges, section 11). */
export function tauxRejet(b: Pick<Bilan, 'validees' | 'rejetees'>): number | null {
  const controlees = b.validees + b.rejetees;
  return controlees ? b.rejetees / controlees : null;
}

/** Ce qui empeche encore de declarer la mission controlee ; liste vide si rien. */
export function restesAControler(b: Bilan): string[] {
  const r: string[] = [];
  if (b.validees === 0) r.push('Aucune preuve validée.');
  if (b.enAttente > 0) r.push(`${b.enAttente} preuve${b.enAttente > 1 ? 's' : ''} à contrôler.`);
  if (b.incidentsBloquants > 0) {
    r.push(`${b.incidentsBloquants} incident${b.incidentsBloquants > 1 ? 's' : ''} grave${b.incidentsBloquants > 1 ? 's' : ''} non résolu${b.incidentsBloquants > 1 ? 's' : ''}.`);
  }
  return r;
}
