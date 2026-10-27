-- PROXIMA CONNECT — schema initial.
--
-- Toutes les tables du cahier des charges (section 7) sont creees des la
-- Phase 1, y compris celles des modules qui viendront ensuite (score,
-- paiements, communication) : ajouter un ecran plus tard ne doit pas
-- obliger a refondre la base.
--
-- Les listes de valeurs sont des CHECK plutot que des types ENUM : ajouter
-- une valeur a un ENUM PostgreSQL ne se fait pas dans une transaction, ce qui
-- complique les migrations.

-- ------------------------------------------------------------ comptes internes

CREATE TABLE utilisateur (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  nom_complet     text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin', 'recrutement', 'mission', 'commercial', 'direction')),
  mot_de_passe    text NOT NULL,
  sel             text NOT NULL,
  actif           boolean NOT NULL DEFAULT true,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  derniere_connexion timestamptz
);

-- Le jeton n'est jamais stocke en clair : une fuite de la table ne donne
-- pas de session utilisable.
CREATE TABLE session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id  uuid NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  jeton_hash      text NOT NULL UNIQUE,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  expire_le       timestamptz NOT NULL,
  ip              text,
  user_agent      text
);
CREATE INDEX session_utilisateur_idx ON session (utilisateur_id);

-- Journal des acces et modifications (cahier des charges 8.1).
-- Volontairement sans cle etrangere vers les entites : une ligne de journal
-- doit survivre a la suppression de ce qu'elle decrit.
CREATE TABLE journal (
  id              bigserial PRIMARY KEY,
  utilisateur_id  uuid REFERENCES utilisateur(id) ON DELETE SET NULL,
  action          text NOT NULL,
  entite          text NOT NULL,
  entite_id       text,
  details         jsonb,
  ip              text,
  cree_le         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_entite_idx ON journal (entite, entite_id, cree_le DESC);
CREATE INDEX journal_date_idx ON journal (cree_le DESC);

-- ------------------------------------------------------------ 5.1 intervenants

CREATE SEQUENCE intervenant_numero_seq;

CREATE TABLE intervenant (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           text NOT NULL UNIQUE
                        DEFAULT 'PX-' || lpad(nextval('intervenant_numero_seq')::text, 5, '0'),

  -- identite et coordonnees
  nom                 text NOT NULL,
  prenoms             text NOT NULL,
  sexe                text CHECK (sexe IN ('F', 'M')),
  date_naissance      date NOT NULL,
  telephone           text NOT NULL UNIQUE,
  whatsapp            text,
  email               text,

  -- localisation et mobilite
  ville               text NOT NULL,
  quartier            text,
  zones               text[] NOT NULL DEFAULT '{}',
  deplacements        text[] NOT NULL DEFAULT '{}',

  -- formation et situation
  niveau_etudes       text,
  formation           text,
  situation           text,
  experiences         text,
  competences         text[] NOT NULL DEFAULT '{}',
  langues             text[] NOT NULL DEFAULT '{}',

  -- disponibilites : jours de la semaine et creneaux (matin, apres-midi, soir)
  jours_disponibles   text[] NOT NULL DEFAULT '{}',
  creneaux            text[] NOT NULL DEFAULT '{}',
  categories_missions text[] NOT NULL DEFAULT '{}',

  -- piece d'identite : type et numero seulement en Phase 1 (pas de scan,
  -- voir note de cadrage, point 7.1)
  piece_type          text,
  piece_numero        text,

  -- moyen de paiement tracable
  paiement_mode       text CHECK (paiement_mode IN ('mobile_money', 'banque')),
  paiement_operateur  text,
  paiement_compte     text,

  -- verifications manuelles (cahier des charges 5.1)
  identite_verifiee_le    timestamptz,
  identite_verifiee_par   uuid REFERENCES utilisateur(id),
  telephone_verifie_le    timestamptz,
  telephone_verifie_par   uuid REFERENCES utilisateur(id),
  paiement_verifie_le     timestamptz,
  paiement_verifie_par    uuid REFERENCES utilisateur(id),

  -- consentement documente : case cochee, horodatee, version du texte accepte
  consentement_le         timestamptz NOT NULL,
  consentement_version    text NOT NULL,
  consentement_ip         text,

  statut              text NOT NULL DEFAULT 'en_attente'
                        CHECK (statut IN ('en_attente', 'verifie', 'actif', 'suspendu', 'inactif')),
  statut_motif        text,
  statut_change_le    timestamptz NOT NULL DEFAULT now(),

  -- PROXIMA SCORE courant (0 a 100), recalcule a chaque evaluation ;
  -- l'historique detaille vit dans score_historique.
  score               numeric(5, 2),

  source              text NOT NULL DEFAULT 'formulaire' CHECK (source IN ('formulaire', 'saisie_interne')),
  cree_le             timestamptz NOT NULL DEFAULT now(),
  maj_le              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intervenant_statut_idx ON intervenant (statut);
CREATE INDEX intervenant_ville_idx ON intervenant (lower(ville));
CREATE INDEX intervenant_zones_idx ON intervenant USING gin (zones);
CREATE INDEX intervenant_competences_idx ON intervenant USING gin (competences);
CREATE INDEX intervenant_categories_idx ON intervenant USING gin (categories_missions);

-- ------------------------------------------------------------ 5.2 clients

CREATE TABLE client (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raison_sociale      text NOT NULL,
  secteur             text,
  ifu                 text,
  contact_nom         text,
  contact_telephone   text,
  contact_email       text,
  adresse_facturation text,
  conditions_paiement text,
  limite_credit_fcfa  bigint NOT NULL DEFAULT 0 CHECK (limite_credit_fcfa >= 0),
  statut_commercial   text NOT NULL DEFAULT 'prospect'
                        CHECK (statut_commercial IN ('prospect', 'pilote', 'actif', 'recurrent')),
  notes               text,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  maj_le              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brief (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES client(id),
  objectif            text NOT NULL,
  categorie           text,
  zone                text,
  nb_profils          integer CHECK (nb_profils > 0),
  date_debut          date,
  date_fin            date,
  horaires            text,
  duree               text,
  competences         text[] NOT NULL DEFAULT '{}',
  budget_fcfa         bigint CHECK (budget_fcfa >= 0),
  livrables           text,
  statut              text NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu', 'converti', 'abandonne')),
  saisi_par           uuid REFERENCES utilisateur(id),
  recu_le             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brief_client_idx ON brief (client_id);

-- ------------------------------------------------------------ 5.3 missions

CREATE SEQUENCE mission_numero_seq;

CREATE TABLE mission (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           text NOT NULL UNIQUE
                        DEFAULT 'M-' || lpad(nextval('mission_numero_seq')::text, 5, '0'),
  client_id           uuid NOT NULL REFERENCES client(id),
  brief_id            uuid REFERENCES brief(id),
  titre               text NOT NULL,
  categorie           text NOT NULL,
  type_mission        text,
  zone                text,
  date_debut          date,
  date_fin            date,
  horaires            text,
  nb_profils_requis   integer NOT NULL DEFAULT 1 CHECK (nb_profils_requis > 0),
  remuneration_agent_fcfa bigint CHECK (remuneration_agent_fcfa >= 0),
  budget_fcfa         bigint CHECK (budget_fcfa >= 0),
  objectifs           text,
  livrables           text,
  score_minimum       numeric(5, 2),
  statut              text NOT NULL DEFAULT 'brief_recu'
                        CHECK (statut IN ('brief_recu', 'selection', 'preparation', 'execution',
                                          'preuves_collectees', 'controlee', 'rapport_transmis',
                                          'payee', 'annulee')),
  responsable_id      uuid REFERENCES utilisateur(id),
  rapport_genere_le   timestamptz,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  maj_le              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_client_idx ON mission (client_id);
CREATE INDEX mission_statut_idx ON mission (statut);

-- Lien mission <-> intervenant. Le pool de remplacement est fait des lignes
-- de role 'remplacant'.
CREATE TABLE affectation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  intervenant_id      uuid NOT NULL REFERENCES intervenant(id),
  role                text NOT NULL DEFAULT 'titulaire' CHECK (role IN ('titulaire', 'remplacant')),
  proposee_le         timestamptz,
  reponse             text NOT NULL DEFAULT 'en_attente' CHECK (reponse IN ('en_attente', 'accepte', 'refuse')),
  reponse_le          timestamptz,
  presence            text CHECK (presence IN ('present', 'retard', 'absent')),
  remplace_affectation_id uuid REFERENCES affectation(id),
  cree_le             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, intervenant_id)
);
CREATE INDEX affectation_intervenant_idx ON affectation (intervenant_id);

-- ------------------------------------------------------------ 5.4 preuves et controle

CREATE TABLE preuve (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  intervenant_id      uuid REFERENCES intervenant(id),
  type                text NOT NULL CHECK (type IN ('formulaire', 'photo', 'geopoint', 'signature', 'contre_appel', 'autre')),
  description         text,
  fichier_url         text,
  latitude            double precision,
  longitude           double precision,
  donnees             jsonb,
  statut              text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
  motif_rejet         text,
  saisie_par          uuid REFERENCES utilisateur(id),
  saisie_le           timestamptz NOT NULL DEFAULT now(),
  validee_par         uuid REFERENCES utilisateur(id),
  validee_le          timestamptz,
  CHECK (statut <> 'rejetee' OR motif_rejet IS NOT NULL)
);
CREATE INDEX preuve_mission_idx ON preuve (mission_id);

CREATE TABLE controle (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  intervenant_id      uuid REFERENCES intervenant(id),
  type                text NOT NULL,
  resultat            text NOT NULL CHECK (resultat IN ('conforme', 'reserve', 'non_conforme')),
  commentaire         text,
  realise_par         uuid REFERENCES utilisateur(id),
  realise_le          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  intervenant_id      uuid REFERENCES intervenant(id),
  description         text NOT NULL,
  gravite             text NOT NULL CHECK (gravite IN ('faible', 'moyenne', 'elevee', 'critique')),
  resolution          text,
  resolu_le           timestamptz,
  declare_par         uuid REFERENCES utilisateur(id),
  declare_le          timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ 5.5 PROXIMA SCORE

-- Ponderation parametrable des criteres (cahier des charges 5.5).
-- 'presence' et 'missions_realisees' sont calcules ; les autres viennent des
-- evaluations.
CREATE TABLE critere_score (
  code                text PRIMARY KEY,
  libelle             text NOT NULL,
  poids               numeric(5, 2) NOT NULL CHECK (poids >= 0),
  calcule             boolean NOT NULL DEFAULT false,
  ordre               integer NOT NULL
);

INSERT INTO critere_score (code, libelle, poids, calcule, ordre) VALUES
  ('ponctualite',        'Ponctualité',                        15, false, 1),
  ('presence',           'Taux de présence',                   15, true,  2),
  ('missions_realisees', 'Nombre de missions réalisées',       10, true,  3),
  ('qualite',            'Qualité du travail',                 15, false, 4),
  ('consignes',          'Respect des consignes',              10, false, 5),
  ('exactitude',         'Exactitude des données transmises',  15, false, 6),
  ('comportement',       'Comportement',                       10, false, 7),
  ('client',             'Évaluation du client',               10, false, 8);

-- Une evaluation par intervenant et par mission ; notes de 1 a 5.
CREATE TABLE evaluation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id      uuid NOT NULL REFERENCES intervenant(id),
  mission_id          uuid NOT NULL REFERENCES mission(id),
  notes               jsonb NOT NULL,
  commentaire         text,
  evaluee_par         uuid REFERENCES utilisateur(id),
  evaluee_le          timestamptz NOT NULL DEFAULT now(),
  contestee_le        timestamptz,
  contestation_motif  text,
  contestation_issue  text,
  UNIQUE (intervenant_id, mission_id)
);

CREATE TABLE score_historique (
  id                  bigserial PRIMARY KEY,
  intervenant_id      uuid NOT NULL REFERENCES intervenant(id),
  score               numeric(5, 2) NOT NULL,
  evaluation_id       uuid REFERENCES evaluation(id),
  cause               text NOT NULL,
  calcule_le          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_historique_intervenant_idx ON score_historique (intervenant_id, calcule_le DESC);

-- ------------------------------------------------------------ 5.6 paiements et facturation

CREATE TABLE paiement_intervenant (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES mission(id),
  intervenant_id      uuid NOT NULL REFERENCES intervenant(id),
  montant_fcfa        bigint NOT NULL CHECK (montant_fcfa >= 0),
  statut              text NOT NULL DEFAULT 'a_payer' CHECK (statut IN ('a_payer', 'paye', 'en_litige')),
  mode                text CHECK (mode IN ('mobile_money', 'virement', 'especes')),
  reference_transaction text,
  du_depuis           timestamptz NOT NULL DEFAULT now(),
  paye_le             timestamptz,
  paye_par            uuid REFERENCES utilisateur(id),
  UNIQUE (mission_id, intervenant_id)
);

-- Acomptes et factures clients. La tresorerie « missions » et la tresorerie
-- administrative sont distinguees par la colonne `tresorerie`.
CREATE TABLE facture (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              text NOT NULL UNIQUE,
  client_id           uuid NOT NULL REFERENCES client(id),
  mission_id          uuid REFERENCES mission(id),
  type                text NOT NULL CHECK (type IN ('acompte', 'facture', 'devis')),
  tresorerie          text NOT NULL DEFAULT 'missions' CHECK (tresorerie IN ('missions', 'administrative')),
  montant_fcfa        bigint NOT NULL CHECK (montant_fcfa >= 0),
  montant_regle_fcfa  bigint NOT NULL DEFAULT 0 CHECK (montant_regle_fcfa >= 0),
  emise_le            date NOT NULL DEFAULT current_date,
  echeance_le         date,
  statut              text NOT NULL DEFAULT 'emise'
                        CHECK (statut IN ('brouillon', 'emise', 'partielle', 'reglee', 'annulee')),
  cree_le             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX facture_client_idx ON facture (client_id);

-- ------------------------------------------------------------ 5.8 communication

CREATE TABLE communication (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id      uuid REFERENCES intervenant(id),
  mission_id          uuid REFERENCES mission(id),
  canal               text NOT NULL CHECK (canal IN ('sms', 'whatsapp', 'appel', 'email')),
  objet               text NOT NULL,
  contenu             text,
  statut              text NOT NULL DEFAULT 'envoye' CHECK (statut IN ('a_envoyer', 'envoye', 'echec', 'recu')),
  auteur_id           uuid REFERENCES utilisateur(id),
  cree_le             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX communication_intervenant_idx ON communication (intervenant_id, cree_le DESC);
CREATE INDEX communication_mission_idx ON communication (mission_id, cree_le DESC);
