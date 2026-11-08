-- Phase 3 : automatisation de la selection des profils et des notifications
-- (cahier des charges, section 9).

ALTER TABLE mission
  -- le programme complete l'equipe tout seul : remplace les refus et les
  -- propositions restees sans reponse par les profils compatibles suivants
  ADD COLUMN selection_auto        boolean NOT NULL DEFAULT false,
  -- remplacants a mobiliser en plus des titulaires, en % de l'effectif
  ADD COLUMN reserve_pourcent      integer NOT NULL DEFAULT 20 CHECK (reserve_pourcent BETWEEN 0 AND 100),
  -- delai laisse a l'intervenant pour repondre a une proposition
  ADD COLUMN delai_reponse_heures  integer NOT NULL DEFAULT 24 CHECK (delai_reponse_heures BETWEEN 2 AND 168);

ALTER TABLE affectation
  -- 'automatique' : profil choisi et propose par le programme
  ADD COLUMN origine                text NOT NULL DEFAULT 'manuel' CHECK (origine IN ('manuel', 'automatique')),
  ADD COLUMN proposition_expire_le  timestamptz,
  ADD COLUMN relance_le             timestamptz,
  -- d'ou vient la reponse : saisie par l'equipe, SMS, espace intervenant, delai depasse
  ADD COLUMN reponse_canal          text CHECK (reponse_canal IN ('equipe', 'sms', 'whatsapp', 'espace', 'delai'));

CREATE INDEX affectation_propositions_idx ON affectation (proposition_expire_le) WHERE reponse = 'en_attente' AND proposee_le IS NOT NULL;

ALTER TABLE communication DROP CONSTRAINT communication_modele_check;
ALTER TABLE communication ADD CONSTRAINT communication_modele_check
  CHECK (modele IN ('proposition', 'relance', 'rappel', 'paiement', 'libre', 'echange', 'acces'));

-- Executions du planificateur : ce qui a ete fait, quand, en combien de temps.
CREATE TABLE tache_execution (
  id          bigserial PRIMARY KEY,
  lancee_le   timestamptz NOT NULL DEFAULT now(),
  declencheur text NOT NULL CHECK (declencheur IN ('planificateur', 'manuel')),
  duree_ms    integer,
  resultat    jsonb,
  erreur      text
);
CREATE INDEX tache_execution_date_idx ON tache_execution (lancee_le DESC);
