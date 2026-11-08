/**
 * Roles et droits (cahier des charges, section 4).
 *
 * Module pur : le menu (client) comme les gardes (serveur) s'y referent.
 * Masquer un lien n'est pas un controle d'acces : chaque page et chaque
 * action revalide le droit cote serveur.
 */

export type Role = 'admin' | 'recrutement' | 'mission' | 'commercial' | 'direction';

export type Droit =
  | 'profil:lire'
  | 'profil:sensible' // numero de piece, coordonnees de paiement
  | 'profil:modifier'
  | 'profil:verifier' // controles et changements de statut
  | 'client:lire'
  | 'client:modifier'
  | 'mission:lire'
  | 'mission:modifier'
  | 'tableau:lire'
  | 'journal:lire'
  | 'compte:gerer'
  | 'parametre:gerer' // ponderation du score et autres reglages
  | 'finance:lire' // paiements, factures, tresorerie
  | 'facture:gerer' // emettre, encaisser, annuler les factures et acomptes
  | 'paiement:gerer'; // payer les intervenants, traiter les litiges

export const ROLES: Record<Role, { libelle: string; droits: Droit[] }> = {
  admin: {
    libelle: 'Administrateur',
    droits: [
      'profil:lire', 'profil:sensible', 'profil:modifier', 'profil:verifier',
      'client:lire', 'client:modifier', 'mission:lire', 'mission:modifier',
      'tableau:lire', 'journal:lire', 'compte:gerer', 'parametre:gerer',
      'finance:lire', 'facture:gerer', 'paiement:gerer',
    ],
  },
  recrutement: {
    libelle: 'Chargé(e) de recrutement',
    droits: ['profil:lire', 'profil:sensible', 'profil:modifier', 'profil:verifier', 'mission:lire', 'tableau:lire'],
  },
  mission: {
    libelle: 'Chargé(e) de mission',
    // voit si l'equipe a ete payee (les intervenants l'appellent), sans payer
    droits: ['profil:lire', 'client:lire', 'mission:lire', 'mission:modifier', 'tableau:lire', 'finance:lire'],
  },
  commercial: {
    libelle: 'Commercial',
    // cahier des charges, section 4 : « generer un devis/facture »
    droits: ['profil:lire', 'client:lire', 'client:modifier', 'mission:lire', 'tableau:lire', 'finance:lire', 'facture:gerer'],
  },
  direction: {
    libelle: 'Direction',
    droits: ['profil:lire', 'profil:sensible', 'client:lire', 'mission:lire', 'tableau:lire', 'journal:lire', 'finance:lire'],
  },
};

export function peut(role: Role, droit: Droit): boolean {
  return ROLES[role]?.droits.includes(droit) ?? false;
}

export interface EntreeMenu {
  href: string;
  libelle: string;
  droit?: Droit;
  /** Module pas encore livre : affiche, mais grise. */
  bientot?: boolean;
}

export const MENU: EntreeMenu[] = [
  { href: '/', libelle: 'Tableau de bord', droit: 'tableau:lire' },
  { href: '/intervenants', libelle: 'Intervenants', droit: 'profil:lire' },
  { href: '/clients', libelle: 'Clients', droit: 'client:lire' },
  { href: '/briefs', libelle: 'Briefs', droit: 'client:lire' },
  { href: '/missions', libelle: 'Missions', droit: 'mission:lire' },
  { href: '/finances', libelle: 'Finances', droit: 'finance:lire' },
  { href: '/reporting', libelle: 'Reporting', droit: 'tableau:lire' },
  { href: '/journal', libelle: 'Journal', droit: 'journal:lire' },
  { href: '/comptes', libelle: 'Comptes', droit: 'compte:gerer' },
  { href: '/parametres/score', libelle: 'Paramètres', droit: 'parametre:gerer' },
];
