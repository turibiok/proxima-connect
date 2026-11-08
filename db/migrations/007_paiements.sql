-- Module 5.6 : paiements des intervenants, factures et reglements clients.
--
-- Les tables `paiement_intervenant` et `facture` existent depuis le socle ;
-- on complete la tracabilite (cahier des charges 5.6 et 8.4 : rapprochement
-- des transactions Mobile Money et bancaires).

-- ------------------------------------------------------------ paiements des intervenants

-- Une ligne par intervenant pointe present, creee quand la mission passe
-- « controlee » : c'est la validation qui fait courir le delai de 48 a 72 h.
ALTER TABLE paiement_intervenant
  -- compte effectivement credite, fige au moment du paiement : si
  -- l'intervenant change de numero ensuite, on sait ou l'argent est parti
  ADD COLUMN compte_beneficiaire  text,
  ADD COLUMN operateur            text,
  -- montant calcule a la creation ; `montant_fcfa` peut etre corrige en
  -- levant un litige, l'ecart reste ainsi visible
  ADD COLUMN montant_initial_fcfa bigint CHECK (montant_initial_fcfa >= 0),
  ADD COLUMN litige_motif         text,
  ADD COLUMN litige_le            timestamptz,
  ADD COLUMN litige_par           uuid REFERENCES utilisateur(id),
  ADD COLUMN litige_resolution    text,
  ADD COLUMN cree_le              timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT paiement_paye_trace CHECK (
    statut <> 'paye' OR (paye_le IS NOT NULL AND mode IS NOT NULL AND reference_transaction IS NOT NULL)
  ),
  ADD CONSTRAINT paiement_litige_motive CHECK (statut <> 'en_litige' OR litige_motif IS NOT NULL);

UPDATE paiement_intervenant SET montant_initial_fcfa = montant_fcfa WHERE montant_initial_fcfa IS NULL;

CREATE INDEX paiement_statut_idx ON paiement_intervenant (statut, du_depuis);
CREATE INDEX paiement_intervenant_idx ON paiement_intervenant (intervenant_id, du_depuis DESC);
-- une reference de transaction ne sert qu'une fois par mode : une saisie en
-- double (meme transfert compte deux fois) est refusee
CREATE UNIQUE INDEX paiement_transaction_unique ON paiement_intervenant (mode, reference_transaction)
  WHERE reference_transaction IS NOT NULL AND mode <> 'especes';

-- ------------------------------------------------------------ factures et acomptes

ALTER TABLE facture
  ADD COLUMN objet             text,
  ADD COLUMN emise_par         uuid REFERENCES utilisateur(id),
  ADD COLUMN motif_annulation  text,
  ADD COLUMN annulee_le        timestamptz,
  ADD COLUMN annulee_par       uuid REFERENCES utilisateur(id),
  ADD CONSTRAINT facture_annulation_motivee CHECK (statut <> 'annulee' OR motif_annulation IS NOT NULL),
  ADD CONSTRAINT facture_regle_plafonne CHECK (montant_regle_fcfa <= montant_fcfa),
  ADD CONSTRAINT facture_echeance_coherente CHECK (echeance_le IS NULL OR echeance_le >= emise_le),
  -- une facture liee a une mission releve toujours de la tresorerie « missions »
  ADD CONSTRAINT facture_tresorerie_mission CHECK (mission_id IS NULL OR tresorerie = 'missions');

CREATE INDEX facture_mission_idx ON facture (mission_id) WHERE mission_id IS NOT NULL;
CREATE INDEX facture_statut_idx ON facture (statut, echeance_le);

-- Numerotation continue par prefixe et par annee (FA-2026-0001,
-- AC-2026-0001) : le compteur est pris dans la transaction de l'emission,
-- une emission annulee ne laisse donc pas de trou.
CREATE TABLE numerotation (
  prefixe  text    NOT NULL,
  annee    integer NOT NULL,
  dernier  integer NOT NULL,
  PRIMARY KEY (prefixe, annee)
);

-- Reglements recus des clients. Le cumul est reporte dans
-- facture.montant_regle_fcfa dans la meme transaction.
CREATE TABLE reglement (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id            uuid NOT NULL REFERENCES facture(id),
  montant_fcfa          bigint NOT NULL CHECK (montant_fcfa > 0),
  mode                  text NOT NULL CHECK (mode IN ('mobile_money', 'virement', 'cheque', 'especes')),
  reference_transaction text NOT NULL,
  regle_le              date NOT NULL,
  saisi_par             uuid REFERENCES utilisateur(id),
  saisi_le              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reglement_facture_idx ON reglement (facture_id);
CREATE UNIQUE INDEX reglement_transaction_unique ON reglement (mode, reference_transaction) WHERE mode <> 'especes';
