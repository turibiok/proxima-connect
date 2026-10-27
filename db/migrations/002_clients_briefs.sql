-- Module 5.2 : complements de la fiche client et du brief.

ALTER TABLE client
  ADD COLUMN ville                 text,
  ADD COLUMN contact_fonction      text,
  -- conditions de paiement structurees : elles alimenteront les echeances
  -- de facture et les alertes de retard (module 5.6)
  ADD COLUMN delai_paiement_jours  integer NOT NULL DEFAULT 30 CHECK (delai_paiement_jours BETWEEN 0 AND 180),
  ADD COLUMN acompte_pourcent      integer NOT NULL DEFAULT 0 CHECK (acompte_pourcent BETWEEN 0 AND 100),
  ADD COLUMN statut_change_le      timestamptz NOT NULL DEFAULT now();

-- L'IFU identifie une entreprise au Benin : deux fiches pour le meme IFU
-- sont un doublon.
CREATE UNIQUE INDEX client_ifu_unique ON client (ifu) WHERE ifu IS NOT NULL;
CREATE INDEX client_raison_sociale_idx ON client (lower(raison_sociale));
CREATE INDEX client_statut_idx ON client (statut_commercial);

ALTER TABLE brief
  ADD COLUMN type_mission   text,
  ADD COLUMN motif_abandon  text,
  ADD COLUMN maj_le         timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT brief_dates_coherentes CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut),
  ADD CONSTRAINT brief_abandon_motive CHECK (statut <> 'abandonne' OR motif_abandon IS NOT NULL);

CREATE INDEX brief_statut_idx ON brief (statut, recu_le DESC);
