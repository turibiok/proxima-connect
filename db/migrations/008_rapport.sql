-- Module 5.7 : rapport de mission destine au client, satisfaction client.

ALTER TABLE mission
  -- synthese redigee pour le client, en tete du rapport
  ADD COLUMN rapport_synthese          text,
  -- transmission du rapport (parcours, etape 13)
  ADD COLUMN rapport_transmis_le       timestamptz,
  ADD COLUMN rapport_canal             text CHECK (rapport_canal IN ('email', 'whatsapp', 'remise', 'autre')),
  ADD COLUMN rapport_destinataire      text,
  ADD COLUMN rapport_transmis_par      uuid REFERENCES utilisateur(id),
  -- retour du client sur la mission (cahier des charges, section 11 :
  -- satisfaction clients d'au moins 85 %, evaluation apres chaque mission)
  ADD COLUMN satisfaction_note         integer CHECK (satisfaction_note BETWEEN 1 AND 5),
  ADD COLUMN satisfaction_commentaire  text,
  ADD COLUMN satisfaction_le           timestamptz,
  ADD COLUMN satisfaction_par          uuid REFERENCES utilisateur(id),
  ADD CONSTRAINT mission_rapport_transmis_complet CHECK (rapport_transmis_le IS NULL OR rapport_canal IS NOT NULL);

-- Indicateurs convenus avec le client (cahier des charges 5.7) : ce qui
-- etait vise, ce qui a ete obtenu.
CREATE TABLE mission_indicateur (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  libelle     text NOT NULL,
  cible       text,
  resultat    text,
  ordre       integer NOT NULL DEFAULT 0
);
CREATE INDEX mission_indicateur_mission_idx ON mission_indicateur (mission_id, ordre);

CREATE INDEX mission_satisfaction_idx ON mission (satisfaction_le) WHERE satisfaction_note IS NOT NULL;
