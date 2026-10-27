# PROXIMA CONNECT — Mise en ligne

Ce guide décrit comment publier l'application. **Rien n'est encore publié.** Le code est prêt et vérifié : la construction de production passe et l'application a été testée en local. Les étapes ci-dessous créent les services en ligne.

---

## 1. Ce qui est prêt dans le code

| Point | État |
|---|---|
| Construction de production (`next build`) | Passe, 28 routes, ~105 Ko de JavaScript au premier chargement |
| Mot de passe provisoire | Un compte créé par un administrateur ou par le script doit changer son mot de passe à la première connexion. Avant ce changement, le compte n'a accès à rien. |
| Mot de passe oublié | Un administrateur génère un nouveau provisoire depuis **Comptes**. Il n'y a pas d'envoi d'e-mail en Phase 1. |
| Essais de mots de passe | Blocage de 15 minutes après 5 échecs sur une même adresse, ou 30 depuis une même adresse IP. Le seuil par IP est large parce que les opérateurs mobiles partagent souvent une même IP. |
| En-têtes de sécurité | HTTPS obligatoire (HSTS), interdiction d'affichage dans un cadre, appareil photo et position limités au site |
| Moteurs de recherche | Seul `/inscription` peut être indexé |
| Région | Fonctions Vercel à Francfort (`vercel.json`), au plus près de la base Neon |
| Premier administrateur | Script `creer-admin`. Le mot de passe est généré et affiché une seule fois, puis doit être changé. |

---

## 2. Architecture en ligne

```
Intervenants et équipes (navigateur)
          │ HTTPS
          ▼
Vercel — application Next.js, région Francfort (fra1)
          │ TLS (connexion « pooled »)
          ▼
Neon — projet « Proxima Connect — production », région Francfort
```

La base de **production** est un projet Neon **distinct** de celui de développement, pour trois raisons :

- les données de démonstration (10 profils fictifs, client « Brasserie du Golfe (démo) », mission M-00001) restent en développement ;
- les identifiants de la production ne servent que pour elle ;
- une erreur en développement ne peut pas toucher les vraies données.

---

## 3. Variables d'environnement

| Variable | Où | Valeur |
|---|---|---|
| `DATABASE_URL` | Vercel, environnement **Production** | Chaîne de connexion Neon de **production**, en version *pooled* (hôte en `-pooler`), avec `?sslmode=verify-full` |
| `DATABASE_URL` | `.env.production.local` sur le poste qui lance les migrations | La même chaîne |

C'est la seule variable nécessaire en production. **Ne pas** définir `ADMIN_EMAIL` ni `ADMIN_MOT_DE_PASSE` chez l'hébergeur : elles ne servent qu'au script de démonstration `semer`, qui ne doit jamais tourner sur la production.

Le fichier `.env.production.local` est exclu de git (règle `.env*.local`). Il contient le mot de passe de la base : ne l'envoyez à personne.

---

## 4. Étapes

### Étape A — Base de production (Neon)

1. Dans la console Neon, créez un nouveau projet :
   - nom : `Proxima Connect — production` ;
   - région : **AWS Europe Central 1 (Francfort)** ;
   - PostgreSQL 18 ;
   - nom de base : `proxima`.
2. Copiez la chaîne de connexion en version **pooled** et remplacez `sslmode=require` par `sslmode=verify-full`.
3. Dans le dossier du projet, créez le fichier `.env.production.local` :
   ```
   DATABASE_URL=postgresql://…-pooler…/proxima?sslmode=verify-full
   ```
4. Appliquez le schéma :
   ```bash
   npm run migrer:prod
   ```
   Le résultat attendu est « 5 migration(s) appliquee(s) ».

> Ne lancez **jamais** `npm run semer` sur la production : il ajouterait des profils fictifs.

### Étape B — Premier administrateur

```bash
npm run creer-admin:prod -- --email prenom.nom@proxima.bj --nom "Prénom Nom"
```

Le terminal affiche la base visée (vérifiez qu'il s'agit bien de la production) et un mot de passe provisoire, une seule fois. À la première connexion, l'application demande d'en choisir un nouveau. Les autres comptes se créent ensuite depuis la page **Comptes**.

Si ce mot de passe est perdu avant la première connexion, relancez la même commande avec `--reinitialiser`.

### Étape C — Dépôt du code

Vercel construit l'application depuis un dépôt git. Deux possibilités :

- **GitHub (recommandé)** : créer un dépôt **privé** `proxima-connect` et y pousser la branche `main`. Chaque nouveau commit pourra alors être publié automatiquement.
- **CLI Vercel** : `npx vercel` depuis le dossier, sans GitHub. C'est plus simple au départ, mais les déploiements ne se font qu'à la main.

### Étape D — Projet Vercel

1. Importez le dépôt dans Vercel. Le type de projet (Next.js) est détecté automatiquement.
2. Dans *Settings → Environment Variables*, ajoutez `DATABASE_URL` (production) pour l'environnement **Production** seulement.
3. Laissez *Node.js Version* sur 22.x ou plus récent.
4. Lancez le déploiement. La région `fra1` est imposée par `vercel.json`.

**Offre Vercel** : l'offre gratuite (*Hobby*) est réservée aux usages non commerciaux. PROXIMA CONNECT étant une activité commerciale, il faut l'offre **Pro**, environ 20 USD par mois et par membre (tarif à confirmer au moment de la souscription).

### Étape E — Nom de domaine

Par exemple `app.proximaconnect.bj` :

1. Ajoutez le domaine dans *Settings → Domains* du projet Vercel.
2. Créez l'enregistrement DNS indiqué par Vercel (un CNAME) chez le registraire.
3. Le certificat HTTPS est fourni automatiquement.

Le lien à diffuser aux intervenants est alors `https://app.proximaconnect.bj/inscription`.

### Étape F — Recette après mise en ligne

À faire sur la vraie adresse, de préférence depuis un téléphone sur réseau mobile :

- [ ] `/inscription` s'affiche sans connexion ; une inscription d'essai aboutit au numéro de dossier.
- [ ] Toute autre adresse renvoie vers `/connexion`.
- [ ] Connexion de l'administrateur, puis changement du mot de passe provisoire.
- [ ] Création d'un compte « Chargé de mission » : l'accès est limité à son rôle.
- [ ] Une photo prise au téléphone est réduite et enregistrée ; la position GPS et la signature au doigt fonctionnent.
- [ ] Le journal trace les connexions et les modifications.
- [ ] Suppression de l'inscription d'essai (voir § 6).

---

## 5. Limites à connaître

| Sujet | Limite | Conséquence |
|---|---|---|
| Taille d'un envoi sur Vercel | 4,5 Mo par requête | Avec JavaScript, les photos sont réduites (~300 Ko) : environ 10 photos par envoi. Sans JavaScript (navigateur très ancien), une seule photo brute peut dépasser la limite. |
| Veille de la base Neon | Mise en veille après 5 min sans activité | La première requête après une pause prend 1 à 3 secondes de plus. L'application relance automatiquement les lectures interrompues. |
| Stockage Neon (offre gratuite) | 1 Go par branche, photos comprises | Environ 3 000 photos réduites. Au-delà : offre payante ou stockage objet dédié (seule la route `/fichiers` est à adapter). |
| Sauvegardes Neon (offre gratuite) | Restauration possible sur les 6 dernières heures seulement | Voir § 7. |

---

## 6. Données d'essai et données réelles

- La base de **développement** garde les données fictives. Elle continue de servir aux essais et aux nouveaux modules.
- La base de **production** démarre vide, avec les seuls critères du PROXIMA SCORE et le premier administrateur.
- Une inscription d'essai faite pendant la recette peut être passée en statut « Inactif » avec le motif « Essai de recette ». Elle reste tracée au journal.

---

## 7. Sauvegardes et retour arrière

- **Application** : Vercel garde chaque déploiement. *Instant Rollback* remet la version précédente en un clic.
- **Base** : avant chaque nouvelle migration en production, créez une branche Neon de sauvegarde (par exemple `avant-006`), puis lancez `npm run migrer:prod`. En cas de problème, la branche permet de revenir en arrière.
- **Sauvegarde régulière** : la restauration Neon ne remonte qu'à 6 heures sur l'offre gratuite. Prévoyez :
  - soit l'offre payante d'entrée (7 jours d'historique) ;
  - soit un export hebdomadaire `pg_dump` conservé hors de Neon.

---

## 8. Avant d'ouvrir l'inscription au public

Ces points ne relèvent pas du code. Ils conditionnent l'ouverture (cahier des charges, section 8.1) :

- [ ] **Protection des données** : faire valider le traitement par un conseil juridique et faire la déclaration auprès de l'**APDP** (Autorité de protection des données personnelles du Bénin).
- [ ] **Texte de consentement** du formulaire d'inscription : le faire relire. S'il change, incrémenter `VERSION_CONSENTEMENT` dans `lib/intervenants/regles.ts`, pour savoir quelle version chaque intervenant a acceptée.
- [ ] **Comptes nominatifs** : un compte par personne, jamais de compte partagé. Le journal n'a de valeur que si chaque action a un auteur identifiable.
- [ ] **Décisions de la note de cadrage** (§ 7) : pondération du score, conservation des données des intervenants inactifs.

---

## 9. Coûts récurrents indicatifs

Tarifs publics à confirmer au moment de la souscription.

| Service | Offre | Coût |
|---|---|---|
| Vercel | Pro (usage commercial) | ~20 USD par mois et par membre |
| Neon | Gratuite au démarrage ; Launch si besoin de sauvegardes plus longues | 0, puis ~20 USD par mois |
| Nom de domaine `.bj` | Annuel | Selon le registraire |
