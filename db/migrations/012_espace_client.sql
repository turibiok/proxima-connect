-- Phase 4 : espace client (suivi des missions, rapports, factures, avis).
--
-- Les clients sont des entreprises : comptes nominatifs par adresse e-mail
-- et mot de passe, crees par l'equipe commerciale (mot de passe provisoire a
-- changer a la premiere connexion). Separes des comptes de l'equipe : autre
-- table, autre session, aucun droit du back-office.

CREATE TABLE compte_client (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  email               text NOT NULL UNIQUE,
  nom_complet         text NOT NULL,
  mot_de_passe        text NOT NULL,
  sel                 text NOT NULL,
  mdp_provisoire      boolean NOT NULL DEFAULT true,
  actif               boolean NOT NULL DEFAULT true,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par            uuid REFERENCES utilisateur(id),
  derniere_connexion  timestamptz
);
CREATE INDEX compte_client_client_idx ON compte_client (client_id);

CREATE TABLE session_client (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id   uuid NOT NULL REFERENCES compte_client(id) ON DELETE CASCADE,
  jeton_hash  text NOT NULL UNIQUE,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  expire_le   timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX session_client_compte_idx ON session_client (compte_id);

-- L'avis sur une mission peut desormais etre donne par le client lui-meme.
ALTER TABLE mission
  ADD COLUMN satisfaction_source  text CHECK (satisfaction_source IN ('equipe', 'client')),
  ADD COLUMN satisfaction_compte  uuid REFERENCES compte_client(id);
UPDATE mission SET satisfaction_source = 'equipe' WHERE satisfaction_note IS NOT NULL;
