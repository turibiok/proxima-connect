-- Module 5.8 : communications avec les intervenants.
--
-- La table `communication` existe depuis le socle ; les propositions de
-- mission y sont deja inscrites (module 5.3). On ajoute de quoi suivre les
-- rappels, les confirmations de paiement, les messages libres et les
-- echanges recus.

ALTER TABLE communication
  ADD COLUMN modele          text CHECK (modele IN ('proposition', 'rappel', 'paiement', 'libre', 'echange')),
  -- sortant : envoye par PROXIMA ; entrant : recu de l'intervenant
  ADD COLUMN sens            text NOT NULL DEFAULT 'sortant' CHECK (sens IN ('sortant', 'entrant')),
  -- manuel : redige par le programme, envoye depuis le telephone de
  -- l'equipe ; automatique : envoye par un fournisseur SMS ou WhatsApp
  -- Business (phase 3, fournisseur a choisir)
  ADD COLUMN mode            text NOT NULL DEFAULT 'manuel' CHECK (mode IN ('manuel', 'automatique')),
  -- numero utilise, fige : l'intervenant peut en changer ensuite
  ADD COLUMN numero          text,
  ADD COLUMN paiement_id     uuid REFERENCES paiement_intervenant(id),
  -- identifiant du message chez le fournisseur, et motif d'un echec
  ADD COLUMN fournisseur_ref text,
  ADD COLUMN erreur          text;

UPDATE communication SET modele = 'proposition' WHERE modele IS NULL AND objet = 'Proposition de mission';

CREATE INDEX communication_paiement_idx ON communication (paiement_id) WHERE paiement_id IS NOT NULL;
