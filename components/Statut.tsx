import { STATUTS_PROFIL, type StatutProfil } from '@/lib/referentiel';
import { STATUTS_BRIEF, STATUTS_COMMERCIAUX, type StatutBrief, type StatutCommercial } from '@/lib/clients/regles';
import { LIBELLES_STATUT_MISSION, type StatutMission } from '@/lib/missions/regles';
import { STATUTS_FACTURE, STATUTS_PAIEMENT, type StatutFacture, type StatutPaiement } from '@/lib/finances/regles';

const TONS = {
  neutre: 'bg-papier text-encre-douce ring-1 ring-trait',
  info: 'bg-marque-pale text-marque-fonce',
  ok: 'bg-ok-pale text-ok',
  alerte: 'bg-alerte-pale text-alerte',
  danger: 'bg-danger-pale text-danger',
  eteint: 'bg-trait/60 text-encre-douce',
};

export function PucePaiement({ statut }: { statut: StatutPaiement }) {
  const s = STATUTS_PAIEMENT[statut];
  return <span className={`puce ${TONS[s.ton]}`}>{s.libelle}</span>;
}

export function PuceFacture({ statut }: { statut: StatutFacture }) {
  const s = STATUTS_FACTURE[statut];
  return <span className={`puce ${TONS[s.ton]}`}>{s.libelle}</span>;
}

export function PuceStatut({ statut }: { statut: StatutProfil }) {
  const s = STATUTS_PROFIL[statut];
  return <span className={`puce ${TONS[s.ton]}`}>{s.libelle}</span>;
}

export function PuceCommerciale({ statut }: { statut: StatutCommercial }) {
  const s = STATUTS_COMMERCIAUX[statut];
  return <span className={`puce ${TONS[s.ton]}`}>{s.libelle}</span>;
}

const TON_MISSION: Record<StatutMission, keyof typeof TONS> = {
  brief_recu: 'neutre',
  selection: 'alerte',
  preparation: 'alerte',
  execution: 'info',
  preuves_collectees: 'info',
  controlee: 'info',
  rapport_transmis: 'info',
  payee: 'ok',
  annulee: 'eteint',
};

export function PuceMission({ statut }: { statut: StatutMission }) {
  return <span className={`puce ${TONS[TON_MISSION[statut]]}`}>{LIBELLES_STATUT_MISSION[statut]}</span>;
}

export function PuceBrief({ statut }: { statut: StatutBrief }) {
  const s = STATUTS_BRIEF[statut];
  return <span className={`puce ${TONS[s.ton]}`}>{s.libelle}</span>;
}
