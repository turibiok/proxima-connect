-- Module 5.3 : missions, selection des profils, propositions, remplacements.

ALTER TABLE mission
  ADD COLUMN lieu               text,
  ADD COLUMN competences        text[] NOT NULL DEFAULT '{}',
  -- briefing et preparation (parcours, etape 4) : traces avant l'execution
  ADD COLUMN briefing_le        timestamptz,
  ADD COLUMN briefing_lieu      text,
  ADD COLUMN briefing_notes     text,
  ADD COLUMN motif_annulation   text,
  ADD COLUMN statut_change_le   timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT mission_dates_coherentes CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut),
  ADD CONSTRAINT mission_annulation_motivee CHECK (statut <> 'annulee' OR motif_annulation IS NOT NULL);

-- Un brief ne donne qu'une mission vivante.
CREATE UNIQUE INDEX mission_brief_unique ON mission (brief_id) WHERE brief_id IS NOT NULL AND statut <> 'annulee';

ALTER TABLE affectation
  ADD COLUMN canal_proposition  text CHECK (canal_proposition IN ('sms', 'whatsapp', 'appel')),
  ADD COLUMN motif_refus        text,
  ADD COLUMN presence_notee_le  timestamptz,
  -- une proposition se fait avec des conditions annoncees : on les fige
  -- au moment de l'envoi, pour pouvoir prouver ce qui a ete propose.
  ADD COLUMN remuneration_proposee_fcfa bigint CHECK (remuneration_proposee_fcfa >= 0);

CREATE INDEX affectation_mission_idx ON affectation (mission_id);
-- un intervenant ne remplace qu'une personne a la fois
CREATE UNIQUE INDEX affectation_remplacement_unique ON affectation (remplace_affectation_id) WHERE remplace_affectation_id IS NOT NULL;
