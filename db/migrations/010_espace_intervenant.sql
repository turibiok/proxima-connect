-- Espace intervenant (cahier des charges, section 4 : consulter son
-- profil, ses missions et son score, en lecture, en phase 2).
--
-- Pas de mot de passe : beaucoup d'intervenants n'ont qu'un telephone et
-- pas d'adresse e-mail. L'equipe envoie un lien personnel (WhatsApp ou
-- SMS) ; a son ouverture, l'intervenant confirme sa date de naissance. Le
-- lien ne sert qu'une fois, puis une session est ouverte sur le telephone.

-- Liens d'acces. Le jeton n'est jamais stocke en clair.
CREATE TABLE acces_intervenant (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id  uuid NOT NULL REFERENCES intervenant(id) ON DELETE CASCADE,
  jeton_hash      text NOT NULL UNIQUE,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  cree_par        uuid REFERENCES utilisateur(id),
  expire_le       timestamptz NOT NULL,
  utilise_le      timestamptz,
  revoque_le      timestamptz,
  -- dates de naissance erronees saisies avec ce lien : au-dela du seuil,
  -- le lien est revoque (un lien transfere ne se devine pas par essais)
  echecs          integer NOT NULL DEFAULT 0
);
CREATE INDEX acces_intervenant_idx ON acces_intervenant (intervenant_id, cree_le DESC);

-- Sessions des intervenants, separees de celles de l'equipe : autre
-- table, autre cookie, aucun droit du back-office.
CREATE TABLE session_intervenant (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id   uuid NOT NULL REFERENCES intervenant(id) ON DELETE CASCADE,
  jeton_hash       text NOT NULL UNIQUE,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  expire_le        timestamptz NOT NULL,
  derniere_visite  timestamptz,
  ip               text,
  user_agent       text
);
CREATE INDEX session_intervenant_idx ON session_intervenant (intervenant_id);

-- L'envoi du lien est trace comme les autres messages (sans le jeton).
ALTER TABLE communication DROP CONSTRAINT communication_modele_check;
ALTER TABLE communication ADD CONSTRAINT communication_modele_check
  CHECK (modele IN ('proposition', 'rappel', 'paiement', 'libre', 'echange', 'acces'));
