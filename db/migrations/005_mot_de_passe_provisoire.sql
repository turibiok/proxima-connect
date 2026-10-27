-- Mise en ligne : un compte cree par un administrateur (ou par le script de
-- premier administrateur) recoit un mot de passe provisoire, qu'il doit
-- remplacer a sa premiere connexion. Le provisoire a ete vu par une autre
-- personne, ou affiche dans un terminal : il ne doit pas durer.

ALTER TABLE utilisateur
  ADD COLUMN mdp_provisoire boolean NOT NULL DEFAULT false,
  ADD COLUMN mdp_change_le  timestamptz;

-- Les comptes existants en developpement restent utilisables tels quels.
