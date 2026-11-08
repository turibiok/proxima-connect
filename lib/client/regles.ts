/**
 * Regles de l'espace client (phase 4). Module pur, teste par
 * tests/client.test.mjs.
 */

export type EtapeClient = 'preparation' | 'terrain' | 'controle' | 'rapport' | 'annulee';

/**
 * Etapes de mission telles que le client les voit : les etapes internes
 * (selection, briefing…) se resument en « preparation ».
 */
export function etapeClient(statut: string): EtapeClient {
  switch (statut) {
    case 'brief_recu':
    case 'selection':
    case 'preparation':
      return 'preparation';
    case 'execution':
      return 'terrain';
    case 'preuves_collectees':
    case 'controlee':
      return 'controle';
    case 'rapport_transmis':
    case 'payee':
      return 'rapport';
    default:
      return 'annulee';
  }
}

export const ETAPES_CLIENT: Record<EtapeClient, { libelle: string; aide: string; ton: 'neutre' | 'info' | 'alerte' | 'ok' | 'eteint' }> = {
  preparation: { libelle: 'En préparation', aide: 'Constitution et briefing de l’équipe.', ton: 'neutre' },
  terrain: { libelle: 'Sur le terrain', aide: 'L’équipe réalise la mission.', ton: 'info' },
  controle: { libelle: 'Contrôle des données', aide: 'PROXIMA vérifie chaque donnée remontée avant de vous la remettre.', ton: 'alerte' },
  rapport: { libelle: 'Rapport disponible', aide: 'Le rapport de mission est consultable.', ton: 'ok' },
  annulee: { libelle: 'Annulée', aide: '', ton: 'eteint' },
};
