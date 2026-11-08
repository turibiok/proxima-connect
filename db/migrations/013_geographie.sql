-- Phase 5 : extension geographique (cahier des charges, section 9).
--
-- Referentiel des 12 departements et 77 communes du Benin ; chaque profil,
-- client et mission est rattache automatiquement a sa commune et a son
-- departement par des declencheurs (aucun chemin d'ecriture ne peut
-- l'oublier) ; les donnees existantes sont rattachees ici meme.
-- Liste identique a lib/geographie.ts (verifie par les tests).

CREATE TABLE departement (
  nom        text PRIMARY KEY,
  chef_lieu  text NOT NULL
);
INSERT INTO departement (nom, chef_lieu) VALUES
  ('Alibori', 'Kandi'),
  ('Atacora', 'Natitingou'),
  ('Atlantique', 'Allada'),
  ('Borgou', 'Parakou'),
  ('Collines', 'Dassa-Zoumè'),
  ('Couffo', 'Aplahoué'),
  ('Donga', 'Djougou'),
  ('Littoral', 'Cotonou'),
  ('Mono', 'Lokossa'),
  ('Ouémé', 'Porto-Novo'),
  ('Plateau', 'Pobè'),
  ('Zou', 'Abomey');

-- cle de comparaison : minuscules, sans accents, toute ponctuation en espace
CREATE FUNCTION cle_geo(t text) RETURNS text IMMUTABLE LANGUAGE sql AS $$
  SELECT trim(regexp_replace(translate(lower(coalesce(t, '')), 'àâäáãéèêëíìîïóòôöõúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE TABLE commune (
  nom          text PRIMARY KEY,
  departement  text NOT NULL REFERENCES departement(nom),
  cle          text NOT NULL UNIQUE
);
INSERT INTO commune (nom, departement, cle) VALUES
  ('Banikoara', 'Alibori', cle_geo('Banikoara')),
  ('Gogounou', 'Alibori', cle_geo('Gogounou')),
  ('Kandi', 'Alibori', cle_geo('Kandi')),
  ('Karimama', 'Alibori', cle_geo('Karimama')),
  ('Malanville', 'Alibori', cle_geo('Malanville')),
  ('Ségbana', 'Alibori', cle_geo('Ségbana')),
  ('Boukoumbé', 'Atacora', cle_geo('Boukoumbé')),
  ('Cobly', 'Atacora', cle_geo('Cobly')),
  ('Kérou', 'Atacora', cle_geo('Kérou')),
  ('Kouandé', 'Atacora', cle_geo('Kouandé')),
  ('Matéri', 'Atacora', cle_geo('Matéri')),
  ('Natitingou', 'Atacora', cle_geo('Natitingou')),
  ('Péhunco', 'Atacora', cle_geo('Péhunco')),
  ('Tanguiéta', 'Atacora', cle_geo('Tanguiéta')),
  ('Toucountouna', 'Atacora', cle_geo('Toucountouna')),
  ('Abomey-Calavi', 'Atlantique', cle_geo('Abomey-Calavi')),
  ('Allada', 'Atlantique', cle_geo('Allada')),
  ('Kpomassè', 'Atlantique', cle_geo('Kpomassè')),
  ('Ouidah', 'Atlantique', cle_geo('Ouidah')),
  ('Sô-Ava', 'Atlantique', cle_geo('Sô-Ava')),
  ('Toffo', 'Atlantique', cle_geo('Toffo')),
  ('Tori-Bossito', 'Atlantique', cle_geo('Tori-Bossito')),
  ('Zè', 'Atlantique', cle_geo('Zè')),
  ('Bembèrèkè', 'Borgou', cle_geo('Bembèrèkè')),
  ('Kalalé', 'Borgou', cle_geo('Kalalé')),
  ('N''Dali', 'Borgou', cle_geo('N''Dali')),
  ('Nikki', 'Borgou', cle_geo('Nikki')),
  ('Parakou', 'Borgou', cle_geo('Parakou')),
  ('Pèrèrè', 'Borgou', cle_geo('Pèrèrè')),
  ('Sinendé', 'Borgou', cle_geo('Sinendé')),
  ('Tchaourou', 'Borgou', cle_geo('Tchaourou')),
  ('Bantè', 'Collines', cle_geo('Bantè')),
  ('Dassa-Zoumè', 'Collines', cle_geo('Dassa-Zoumè')),
  ('Glazoué', 'Collines', cle_geo('Glazoué')),
  ('Ouèssè', 'Collines', cle_geo('Ouèssè')),
  ('Savalou', 'Collines', cle_geo('Savalou')),
  ('Savè', 'Collines', cle_geo('Savè')),
  ('Aplahoué', 'Couffo', cle_geo('Aplahoué')),
  ('Djakotomey', 'Couffo', cle_geo('Djakotomey')),
  ('Dogbo', 'Couffo', cle_geo('Dogbo')),
  ('Klouékanmè', 'Couffo', cle_geo('Klouékanmè')),
  ('Lalo', 'Couffo', cle_geo('Lalo')),
  ('Toviklin', 'Couffo', cle_geo('Toviklin')),
  ('Bassila', 'Donga', cle_geo('Bassila')),
  ('Copargo', 'Donga', cle_geo('Copargo')),
  ('Djougou', 'Donga', cle_geo('Djougou')),
  ('Ouaké', 'Donga', cle_geo('Ouaké')),
  ('Cotonou', 'Littoral', cle_geo('Cotonou')),
  ('Athiémé', 'Mono', cle_geo('Athiémé')),
  ('Bopa', 'Mono', cle_geo('Bopa')),
  ('Comè', 'Mono', cle_geo('Comè')),
  ('Grand-Popo', 'Mono', cle_geo('Grand-Popo')),
  ('Houéyogbé', 'Mono', cle_geo('Houéyogbé')),
  ('Lokossa', 'Mono', cle_geo('Lokossa')),
  ('Adjarra', 'Ouémé', cle_geo('Adjarra')),
  ('Adjohoun', 'Ouémé', cle_geo('Adjohoun')),
  ('Aguégués', 'Ouémé', cle_geo('Aguégués')),
  ('Akpro-Missérété', 'Ouémé', cle_geo('Akpro-Missérété')),
  ('Avrankou', 'Ouémé', cle_geo('Avrankou')),
  ('Bonou', 'Ouémé', cle_geo('Bonou')),
  ('Dangbo', 'Ouémé', cle_geo('Dangbo')),
  ('Porto-Novo', 'Ouémé', cle_geo('Porto-Novo')),
  ('Sèmè-Kpodji', 'Ouémé', cle_geo('Sèmè-Kpodji')),
  ('Adja-Ouèrè', 'Plateau', cle_geo('Adja-Ouèrè')),
  ('Ifangni', 'Plateau', cle_geo('Ifangni')),
  ('Kétou', 'Plateau', cle_geo('Kétou')),
  ('Pobè', 'Plateau', cle_geo('Pobè')),
  ('Sakété', 'Plateau', cle_geo('Sakété')),
  ('Abomey', 'Zou', cle_geo('Abomey')),
  ('Agbangnizoun', 'Zou', cle_geo('Agbangnizoun')),
  ('Bohicon', 'Zou', cle_geo('Bohicon')),
  ('Covè', 'Zou', cle_geo('Covè')),
  ('Djidja', 'Zou', cle_geo('Djidja')),
  ('Ouinhi', 'Zou', cle_geo('Ouinhi')),
  ('Za-Kpota', 'Zou', cle_geo('Za-Kpota')),
  ('Zagnanado', 'Zou', cle_geo('Zagnanado')),
  ('Zogbodomey', 'Zou', cle_geo('Zogbodomey'));

-- variantes courantes et grands quartiers
CREATE TABLE commune_alias (
  cle      text PRIMARY KEY,
  commune  text NOT NULL REFERENCES commune(nom)
);
INSERT INTO commune_alias (cle, commune) VALUES
  (cle_geo('Sèmè-Podji'), 'Sèmè-Kpodji'),
  (cle_geo('Seme'), 'Sèmè-Kpodji'),
  (cle_geo('Calavi'), 'Abomey-Calavi'),
  (cle_geo('Godomey'), 'Abomey-Calavi'),
  (cle_geo('Akassato'), 'Abomey-Calavi'),
  (cle_geo('Togba'), 'Abomey-Calavi'),
  (cle_geo('Ouèdo'), 'Abomey-Calavi'),
  (cle_geo('Cocotomey'), 'Abomey-Calavi'),
  (cle_geo('Dassa'), 'Dassa-Zoumè'),
  (cle_geo('Dogbo-Tota'), 'Dogbo'),
  (cle_geo('Ndali'), 'N''Dali'),
  (cle_geo('Tori'), 'Tori-Bossito'),
  (cle_geo('So-Ava'), 'Sô-Ava'),
  (cle_geo('Missérété'), 'Akpro-Missérété'),
  (cle_geo('Ekpè'), 'Sèmè-Kpodji'),
  (cle_geo('Agblangandan'), 'Sèmè-Kpodji'),
  (cle_geo('Kandi-Fô'), 'Kandi'),
  (cle_geo('Pahou'), 'Ouidah'),
  (cle_geo('Glo-Djigbé'), 'Abomey-Calavi'),
  (cle_geo('Akpakpa'), 'Cotonou'),
  (cle_geo('Cadjèhoun'), 'Cotonou'),
  (cle_geo('Fidjrossè'), 'Cotonou'),
  (cle_geo('Gbégamey'), 'Cotonou'),
  (cle_geo('Agla'), 'Cotonou'),
  (cle_geo('Dantokpa'), 'Cotonou'),
  (cle_geo('Ganhi'), 'Cotonou'),
  (cle_geo('Zogbo'), 'Cotonou'),
  (cle_geo('Haie Vive'), 'Cotonou'),
  (cle_geo('Ouando'), 'Porto-Novo'),
  (cle_geo('Banikanni'), 'Parakou');

-- commune reconnue dans un texte libre ; la correspondance la plus longue gagne
CREATE FUNCTION localiser_commune(t text) RETURNS text STABLE LANGUAGE sql AS $$
  SELECT x.commune FROM (
    SELECT nom AS commune, cle FROM commune
    UNION ALL SELECT commune, cle FROM commune_alias
  ) x
  WHERE ' ' || cle_geo(t) || ' ' LIKE '% ' || x.cle || ' %'
  ORDER BY length(x.cle) DESC
  LIMIT 1
$$;

ALTER TABLE intervenant ADD COLUMN commune text REFERENCES commune(nom), ADD COLUMN departement text REFERENCES departement(nom);
ALTER TABLE client      ADD COLUMN commune text REFERENCES commune(nom), ADD COLUMN departement text REFERENCES departement(nom);
ALTER TABLE mission     ADD COLUMN commune text REFERENCES commune(nom), ADD COLUMN departement text REFERENCES departement(nom);
CREATE INDEX intervenant_departement_idx ON intervenant (departement);
CREATE INDEX mission_departement_idx ON mission (departement);

CREATE FUNCTION localiser_intervenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.commune := coalesce(localiser_commune(NEW.ville), localiser_commune(NEW.quartier));
  NEW.departement := (SELECT departement FROM commune WHERE nom = NEW.commune);
  RETURN NEW;
END $$;
CREATE TRIGGER intervenant_localisation BEFORE INSERT OR UPDATE OF ville, quartier ON intervenant
  FOR EACH ROW EXECUTE FUNCTION localiser_intervenant();

CREATE FUNCTION localiser_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.commune := coalesce(localiser_commune(NEW.ville), localiser_commune(NEW.adresse_facturation));
  NEW.departement := (SELECT departement FROM commune WHERE nom = NEW.commune);
  RETURN NEW;
END $$;
CREATE TRIGGER client_localisation BEFORE INSERT OR UPDATE OF ville, adresse_facturation ON client
  FOR EACH ROW EXECUTE FUNCTION localiser_client();

CREATE FUNCTION localiser_mission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.commune := coalesce(localiser_commune(NEW.zone), localiser_commune(NEW.lieu));
  NEW.departement := (SELECT departement FROM commune WHERE nom = NEW.commune);
  RETURN NEW;
END $$;
CREATE TRIGGER mission_localisation BEFORE INSERT OR UPDATE OF zone, lieu ON mission
  FOR EACH ROW EXECUTE FUNCTION localiser_mission();

-- rattachement des donnees existantes
UPDATE intervenant SET commune = coalesce(localiser_commune(ville), localiser_commune(quartier));
UPDATE intervenant SET departement = c.departement FROM commune c WHERE c.nom = intervenant.commune;
UPDATE client SET commune = coalesce(localiser_commune(ville), localiser_commune(adresse_facturation));
UPDATE client SET departement = c.departement FROM commune c WHERE c.nom = client.commune;
UPDATE mission SET commune = coalesce(localiser_commune(zone), localiser_commune(lieu));
UPDATE mission SET departement = c.departement FROM commune c WHERE c.nom = mission.commune;

-- Territoires ou PROXIMA intervient : ouverture progressive (section 9 :
-- extension geographique selon le developpement commercial).
CREATE TABLE territoire (
  departement       text PRIMARY KEY REFERENCES departement(nom),
  statut            text NOT NULL DEFAULT 'ferme' CHECK (statut IN ('ouvert', 'preparation', 'ferme')),
  objectif_profils  integer CHECK (objectif_profils >= 0),
  note              text,
  maj_le            timestamptz NOT NULL DEFAULT now(),
  maj_par           uuid REFERENCES utilisateur(id)
);
-- point de depart : le Grand Nokoue (Cotonou, Abomey-Calavi, Porto-Novo, Seme-Kpodji)
INSERT INTO territoire (departement, statut, objectif_profils)
SELECT nom, CASE WHEN nom IN ('Littoral', 'Atlantique', 'Ouémé') THEN 'ouvert' ELSE 'ferme' END,
       CASE WHEN nom IN ('Littoral', 'Atlantique', 'Ouémé') THEN 100 END
  FROM departement;
