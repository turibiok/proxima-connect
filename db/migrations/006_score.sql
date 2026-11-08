-- Module 5.5 : PROXIMA SCORE, evaluations et contestations.
--
-- Les tables `critere_score`, `evaluation` et `score_historique` existent
-- depuis le socle ; on complete le circuit de contestation (cahier des
-- charges 5.5 : transparence et procedure de contestation).

ALTER TABLE evaluation
  -- qui a enregistre la contestation (l'intervenant conteste par telephone
  -- ou sur place ; l'equipe la consigne)
  ADD COLUMN contestation_par         uuid REFERENCES utilisateur(id),
  -- traitement : une personne differente de l'evaluateur
  ADD COLUMN contestation_traitee_par uuid REFERENCES utilisateur(id),
  ADD COLUMN contestation_traitee_le  timestamptz,
  ADD COLUMN contestation_explication text,
  ADD CONSTRAINT evaluation_issue CHECK (contestation_issue IS NULL OR contestation_issue IN ('maintenue', 'corrigee', 'annulee')),
  ADD CONSTRAINT evaluation_issue_motivee CHECK (contestation_issue IS NULL OR contestation_explication IS NOT NULL),
  ADD CONSTRAINT evaluation_contestation_motivee CHECK (contestee_le IS NULL OR contestation_motif IS NOT NULL);

CREATE INDEX evaluation_intervenant_idx ON evaluation (intervenant_id, evaluee_le DESC);
CREATE INDEX evaluation_mission_idx ON evaluation (mission_id);
CREATE INDEX evaluation_contestation_idx ON evaluation (contestee_le) WHERE contestee_le IS NOT NULL AND contestation_issue IS NULL;

-- Le detail du calcul est garde avec chaque etat du score : on peut ainsi
-- expliquer a l'intervenant d'ou vient son score a une date donnee.
ALTER TABLE score_historique
  ADD COLUMN detail jsonb,
  ADD COLUMN calcule_par uuid REFERENCES utilisateur(id);
