# PROXIMA CONNECT

Back-office de PROXIMA CONNECT. Il gère le vivier d'intervenants, les clients, les missions et les preuves terrain.

- **Cahier des charges** : document PDF fourni par PROXIMA CONNECT, conservé hors du dépôt
- **Note de cadrage technique** : [docs/note-de-cadrage.md](docs/note-de-cadrage.md)
- **Mise en ligne** : [docs/mise-en-ligne.md](docs/mise-en-ligne.md)

## État

| Module | État |
|---|---|
| Socle : comptes, rôles, sessions, journal | Livré |
| 5.1 Inscription et profils : formulaire public, recherche, vérification, statuts | Livré |
| Tableau de bord de base | Livré |
| 5.2 Clients et briefs : fiches, statut commercial, limite de crédit, briefs | Livré |
| 5.3 Missions et sélection : création depuis un brief, profils compatibles, propositions, briefing, présence, remplacements | Livré |
| 5.4 Preuves et contrôle terrain : photos, géopoints, signatures, contre-appels, formulaires importés, validation, contrôles qualité, incidents | Livré |
| 5.5 à 5.8 Score, paiements, reporting, communication | Phase 2 (tables déjà créées) |

## Démarrer

Prérequis : Node 22.6 ou plus récent, et une base PostgreSQL (Neon).

```bash
npm install
cp .env.example .env.local   # renseigner DATABASE_URL, ADMIN_EMAIL, ADMIN_MOT_DE_PASSE
npm run migrer               # crée les tables
npm run semer -- --demo      # premier administrateur + 10 profils fictifs (sans --demo : administrateur seul)
npm run dev                  # http://localhost:3100
```

- `/inscription` : formulaire public des intervenants, accessible sans compte.
- `/connexion` : espace équipe.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (port 3100) |
| `npm test` | Tests des règles métier : téléphone, âge, statuts, recherche |
| `npm run typecheck` | Vérification des types TypeScript |
| `npm run migrer` | Applique les nouvelles migrations de `db/migrations` |
| `npm run semer` | Base de développement : administrateur et profils fictifs (`-- --demo`) |
| `npm run creer-admin` | Crée un administrateur avec un mot de passe provisoire |
| `npm run migrer:prod`, `npm run creer-admin:prod` | Mêmes commandes sur la base de production (`.env.production.local`) |

## Organisation

```
app/                 pages et actions serveur (Next.js App Router)
components/          composants partagés (formulaire intervenant, menu…)
lib/referentiel.ts   listes de valeurs : catalogue des missions, villes, statuts…
lib/intervenants/    règles métier (pures, testées), recherche, actions
lib/auth/            rôles et droits, sessions, mots de passe
db/migrations/       schéma SQL versionné
```

Les droits sont contrôlés côté serveur, dans chaque page (`exiger`) et dans chaque action (`exigerAction`). Masquer un lien dans le menu n'est pas un contrôle d'accès.
