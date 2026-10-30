-- Module 5.4 : preuves d'execution, controles qualite, incidents.

-- Fichiers joints aux preuves (photos, signatures, formulaires importes).
--
-- Stockes dans la base en Phase 1 : pas de second service a heberger ni a
-- sauvegarder, et l'acces passe par les memes controles de droits que le
-- reste. Les photos sont reduites dans le navigateur avant l'envoi (quelques
-- centaines de Ko). A deplacer vers un stockage objet si le volume grossit :
-- seule la route /fichiers/[id] serait a changer.
--
-- Table separee de `preuve` : lister les preuves ne charge jamais les octets.
CREATE TABLE fichier (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preuve_id   uuid NOT NULL REFERENCES preuve(id) ON DELETE CASCADE,
  nom         text NOT NULL,
  type_mime   text NOT NULL,
  taille      integer NOT NULL CHECK (taille > 0 AND taille <= 8 * 1024 * 1024),
  sha256      text NOT NULL,
  contenu     bytea NOT NULL,
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fichier_preuve_idx ON fichier (preuve_id);

ALTER TABLE preuve
  -- moment de la prise sur le terrain, distinct du moment de la saisie
  ADD COLUMN realisee_le        timestamptz,
  ADD COLUMN precision_m        numeric(8, 1) CHECK (precision_m >= 0),
  -- photo : les personnes identifiables ont donne leur accord (cahier des charges : « photos consenties »)
  ADD COLUMN consentement_photo boolean,
  ADD CONSTRAINT preuve_geopoint_complet CHECK (type <> 'geopoint' OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  ADD CONSTRAINT preuve_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT preuve_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT preuve_photo_consentie CHECK (type <> 'photo' OR consentement_photo IS TRUE);
CREATE INDEX preuve_statut_idx ON preuve (mission_id, statut);

ALTER TABLE incident
  ADD COLUMN resolu_par uuid REFERENCES utilisateur(id),
  ADD CONSTRAINT incident_resolution_complete CHECK ((resolu_le IS NULL) = (resolution IS NULL));
CREATE INDEX incident_mission_idx ON incident (mission_id);

CREATE INDEX controle_mission_idx ON controle (mission_id);
