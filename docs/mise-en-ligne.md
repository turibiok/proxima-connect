# PROXIMA CONNECT : mise en ligne

Ce guide décrit comment publier l'application. Les sections 1 à 8 couvrent la première mise en ligne (Phase 1) ; la section 9 décrit la mise à jour vers la Phase 2.

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
Vercel : application Next.js, région Francfort (fra1)
          │ TLS (connexion « pooled »)
          ▼
Neon : projet « Proxima Connect production », région Francfort
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

> **Sous Windows, dans PowerShell** : si `npm` répond « l'exécution de scripts est désactivée sur ce système », tapez `npm.cmd` à la place de `npm`, par exemple `npm.cmd run migrer:prod`. Le résultat est identique et aucun réglage de sécurité du poste n'est à modifier. L'Invite de commandes (`cmd`) n'a pas ce blocage.
>
> Si une commande répond `Cannot find package 'pg'`, les dépendances manquent (dossier `node_modules` absent) : lancez d'abord `npm.cmd ci`.

### Étape A. Base de production (Neon)

1. Dans la console Neon, créez un nouveau projet :
   - nom : `Proxima Connect production` ;
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

### Étape B. Premier administrateur

```bash
npm run creer-admin:prod -- --email prenom.nom@proxima.bj --nom "Prénom Nom"
```

Le terminal affiche la base visée (vérifiez qu'il s'agit bien de la production) et un mot de passe provisoire, une seule fois. À la première connexion, l'application demande d'en choisir un nouveau. Les autres comptes se créent ensuite depuis la page **Comptes**.

Si ce mot de passe est perdu avant la première connexion, relancez la même commande avec `--reinitialiser`.

### Étape C. Dépôt du code

Vercel construit l'application depuis un dépôt git. Deux possibilités :

- **GitHub (recommandé)** : créer un dépôt **privé** `proxima-connect` et y pousser la branche `main`. Chaque nouveau commit pourra alors être publié automatiquement.
- **CLI Vercel** : `npx vercel` depuis le dossier, sans GitHub. C'est plus simple au départ, mais les déploiements ne se font qu'à la main.

### Étape D. Projet Vercel

1. Importez le dépôt dans Vercel. Le type de projet (Next.js) est détecté automatiquement.
2. Dans *Settings → Environment Variables*, ajoutez `DATABASE_URL` (production) pour l'environnement **Production** seulement.
3. Laissez *Node.js Version* sur 22.x ou plus récent.
4. Lancez le déploiement. La région `fra1` est imposée par `vercel.json`.

**Offre Vercel** : l'offre gratuite (*Hobby*) est réservée aux usages non commerciaux. PROXIMA CONNECT étant une activité commerciale, il faut l'offre **Pro**, environ 20 USD par mois et par membre (tarif à confirmer au moment de la souscription).

### Étape E. Nom de domaine

Par exemple `app.proximaconnect.bj` :

1. Ajoutez le domaine dans *Settings → Domains* du projet Vercel.
2. Créez l'enregistrement DNS indiqué par Vercel (un CNAME) chez le registraire.
3. Le certificat HTTPS est fourni automatiquement.

Le lien à diffuser aux intervenants est alors `https://app.proximaconnect.bj/inscription`.

### Étape F. Recette après mise en ligne

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

## 9. Mise à jour vers la Phase 2

La Phase 2 est développée sur la branche `phase-2`. Elle ajoute :

| Module | Contenu |
|---|---|
| 5.5 PROXIMA SCORE | Évaluation de l’équipe après chaque mission, score calculé et pondérable (page **Paramètres**), historique, contestations |
| 5.6 Paiements et facturation | Paiements des intervenants (objectif 48 à 72 h), factures et acomptes, règlements, deux trésoreries, alertes de retard et de crédit (menu **Finances**) |
| 5.7 Reporting | Rapport de mission pour le client (imprimable en PDF), avis du client, rentabilité, exports CSV (menu **Reporting**) |
| 5.8 Communication | Rappels, confirmations de paiement et messages rédigés par le programme, envoyés depuis le téléphone de l’équipe ; historique des échanges |
| Espace intervenant | L’intervenant consulte ses missions, ses paiements, son score et son profil, par un lien personnel (adresse `/espace`) |

Aucune nouvelle variable d’environnement n’est nécessaire.

### Ordre des opérations

Les cinq migrations (`006` à `010`) ne font qu’ajouter des tables, des colonnes et des contraintes : le code actuellement en ligne fonctionne avec la base migrée. On migre donc **d’abord** la base, **puis** on publie le code.

1. **Vérifier l’état de la production**, sans rien modifier :
   ```bash
   npm run migrer:prod -- --verifier
   ```
   Vérifiez que la base visée est bien celle de production (hôte différent de celui de `.env.local`). Le résultat attendu est « A appliquer (5) : 006_score.sql, 007_paiements.sql, 008_rapport.sql, 009_communication.sql, 010_espace_intervenant.sql ».
2. **Sauvegarder la base** : dans la console Neon, projet de production, *Branches → Create branch*, depuis la branche principale, données actuelles, nom `avant-phase-2`.
3. **Appliquer les migrations** :
   ```bash
   npm run migrer:prod
   ```
   Résultat attendu : « 5 migration(s) appliquee(s) ». Chaque migration est appliquée dans sa propre transaction : en cas d’échec, la migration fautive est annulée entièrement et les suivantes ne sont pas tentées.
4. **Publier le code** : fusionner `phase-2` dans `main` et pousser. Vercel construit et publie automatiquement.
   ```bash
   git checkout main
   git merge --ff-only phase-2
   git push origin main
   ```
5. **Recette** (ci-dessous), puis supprimer les données d’essai créées pendant la recette.

### Recette de la Phase 2

À faire sur la vraie adresse, avec de préférence une mission d’essai sur un client d’essai :

- [ ] Menus **Finances**, **Reporting** et **Paramètres** visibles pour l’administrateur ; un compte « Chargé de mission » ne voit pas **Paramètres** et ne peut pas payer.
- [ ] **Paramètres** : la pondération du score s’affiche avec les valeurs de départ (15 / 15 / 10 / 15 / 10 / 15 / 10 / 10).
- [ ] Une mission qui passe à « Contrôlée » crée un paiement « À payer » par intervenant pointé présent.
- [ ] Un paiement s’enregistre avec sa référence ; la confirmation à l’intervenant s’ouvre dans WhatsApp sur un téléphone.
- [ ] Une facture reçoit le numéro `FA-<année>-0001` ; un règlement partiel la passe « Réglée en partie ».
- [ ] Le rapport client s’imprime ou s’enregistre en PDF depuis le navigateur, sans menu ni boutons.
- [ ] Un export CSV s’ouvre dans Excel avec les accents corrects.
- [ ] Un lien d’accès à l’espace intervenant, envoyé à votre propre numéro sur un profil d’essai, s’ouvre avec la date de naissance ; le lien ne sert qu’une fois.

### Bon à savoir

- **Missions déjà « contrôlées »** : les paiements naissent au passage à cette étape. Une mission qui l’a franchie avant la mise à jour n’a pas de paiement : la ramener à « Preuves collectées » puis la repasser à « Contrôlée » les crée.
- **Scores** : le score est désormais calculé à partir des évaluations et des présences. Un profil sans évaluation ni présence n’a pas de score (« - »).
- **Titres de mission** : ils sont visibles des intervenants dans leur espace. Pour une mission confidentielle (visite mystère), choisir un titre qui ne nomme pas le client.
- **Liens de l’espace intervenant** : ils pointent vers l’adresse depuis laquelle ils ont été préparés. Les préparer depuis le site en ligne, jamais depuis un poste de développement.

### Retour arrière

- **Code** : *Instant Rollback* dans Vercel remet la version précédente. La base migrée reste compatible avec elle : pas besoin de toucher à la base.
- **Base** : seulement si une migration a abîmé des données, restaurer depuis la branche `avant-phase-2`.

### Décisions encore attendues de PROXIMA

| Sujet | Valeur de départ dans le programme |
|---|---|
| Pondération des 8 critères du score | 15 / 15 / 10 / 15 / 10 / 15 / 10 / 10 (modifiable dans **Paramètres**) |
| Qui paie les intervenants | Administrateur seulement ; le commercial émet et encaisse les factures |
| Retard de paiement client « important » | Plus de 15 jours après l’échéance |
| Client « satisfait » | Note de 4 ou 5 sur 5 (cible : 85 %) |
| Fournisseur SMS / WhatsApp Business | Aucun : envoi depuis le téléphone de l’équipe, en attendant le choix (note de cadrage, § 7.3) |
| Mentions légales des factures | Non imprimées par le programme : IFU, adresse et RCCM de PROXIMA à fournir |

---

## 10. Phase 3 : sélection et notifications automatiques

Développée sur la branche `phase-3` (après la Phase 2). Elle ne se publie qu’une fois la Phase 2 en ligne, comme elle : migration `011_automatisation.sql` d’abord, puis le code.

### Ce qu’elle apporte

- **Sélection automatique** (page *Sélection des profils* d’une mission) : le programme retient les profils compatibles les mieux classés, titulaires puis réserve (20 % par défaut), et leur envoie la proposition. Option « continuer automatiquement » : un refus, un retrait ou une proposition restée sans réponse libère la place, aussitôt reproposée au profil suivant.
- **Délai de réponse** (24 h par défaut) : relance à mi-délai, puis la proposition expire.
- **Réponses des intervenants** : OUI ou NON par SMS ou WhatsApp, ou boutons « J’accepte » / « Je refuse » dans leur espace.
- **Tâches planifiées**, chaque heure : relances, expirations, rappel la veille du démarrage, confirmation des paiements versés, complétion des équipes. Suivi et lancement manuel dans *Paramètres → Automatisation*.

### Sans fournisseur d’envoi (situation par défaut)

Rien ne change pour les messages : le programme ne marque jamais un message comme envoyé s’il n’est pas parti. La sélection automatique ajoute les profils « à proposer » et l’équipe envoie les propositions comme en Phase 2. Les intervenants peuvent déjà répondre depuis leur espace.

### Activer l’envoi automatique (Twilio)

Twilio a été retenu comme premier fournisseur : il couvre le SMS et WhatsApp avec une seule API, et ses numéros acceptent les réponses. Un autre fournisseur s’ajouterait dans `lib/automatisation/` sans toucher au reste.

1. Ouvrir un compte Twilio, acheter un numéro capable d’envoyer des SMS vers le Bénin (ou faire valider un identifiant d’expéditeur alphanumérique « PROXIMA »).
2. Facultatif : faire valider un numéro **WhatsApp Business** par Meta, via Twilio. Hors de la fenêtre de 24 h ouverte par un message de l’intervenant, WhatsApp n’accepte que des modèles de message approuvés : à prévoir avant d’activer WhatsApp pour les propositions.
3. Dans Vercel (*Settings → Environment Variables*, environnement Production) :

   | Variable | Valeur |
   |---|---|
   | `COMMUNICATION_FOURNISSEUR` | `twilio` |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Identifiants du compte Twilio |
   | `TWILIO_SMS_FROM` | Numéro ou identifiant d’expéditeur |
   | `TWILIO_WHATSAPP_FROM` | Numéro WhatsApp validé (facultatif) |
   | `APP_URL` | Adresse publique, par exemple `https://app.proximaconnect.bj` |

4. Dans la console Twilio, sur le numéro : webhook *A message comes in*, méthode **POST**, adresse `https://<site>/api/communication/entrant`. Chaque requête reçue est authentifiée par sa signature Twilio.
5. Coûts : facturés par message par Twilio (SMS vers le Bénin, conversations WhatsApp), à vérifier sur leur grille au moment de l’ouverture.

> Ne jamais mettre `COMMUNICATION_FOURNISSEUR=simulation` en production : les envois seraient tracés comme faits sans que rien ne parte.

### Activer le planificateur

1. Définir `CRON_SECRET` dans Vercel (une longue valeur aléatoire). Sans elle, `/api/taches` refuse toute requête.
2. La fréquence horaire est déclarée dans `vercel.json`. L’offre *Hobby* de Vercel limite les tâches planifiées à une par jour : l’offre **Pro** (déjà nécessaire pour un usage commercial) permet l’exécution horaire.

---

## 11. Phase 4 : application mobile et espace client

Branche `phase-4` (après la Phase 3). Migration `012_espace_client.sql`.

### Application installable

Plutôt qu’une application de magasin (Play Store, App Store), le site s’installe sur l’écran d’accueil du téléphone (« application web progressive ») :

- un seul code à maintenir, aucun compte développeur Google ou Apple, aucune validation de magasin ;
- mises à jour immédiates pour tous, sans téléchargement ;
- icône, ouverture en plein écran, page « hors connexion » quand le réseau manque.

Fonctionnement :

- **Android (Chrome)** : un bouton « Installer » apparaît dans l’espace intervenant et l’espace client.
- **iPhone (Safari)** : bouton Partager, puis « Sur l’écran d’accueil » (rappelé à l’écran).
- À l’ouverture, l’application oriente chacun vers son espace : tableau de bord pour l’équipe, espace intervenant, espace client.
- Par prudence, aucune page n’est gardée en mémoire sur le téléphone (données personnelles, téléphones prêtés) : seuls les fichiers techniques et la page « hors connexion » le sont.

Si une application de magasin devenait nécessaire (notifications poussées sur iPhone, par exemple), elle pourrait envelopper ce même site.

### Espace client

- Adresse : `/client`. Les accès se créent depuis la fiche client, bloc **Espace client** (rôles administrateur et commercial).
- Le mot de passe provisoire n’est affiché qu’une fois : le transmettre de vive voix ou par téléphone, pas par l’adresse e-mail du compte. Il doit être changé à la première connexion.
- Le client voit ses missions (préparation, terrain, contrôle des données, rapport disponible), lit et imprime les rapports transmis (le même document que celui préparé par l’équipe), consulte ses factures et le reste à régler, et donne son avis sur chaque mission.
- Il ne voit rien des intervenants (ni noms ni coordonnées) ni des autres clients.

### Recette

- [ ] Sur un téléphone Android : « Installer », puis ouverture depuis l’icône.
- [ ] Mode avion : la page « Pas de connexion » s’affiche.
- [ ] Création d’un accès client, connexion, changement du mot de passe provisoire.
- [ ] Un rapport transmis s’affiche avec ses photos ; l’avis du client apparaît sur la page du rapport côté équipe.

---

## 12. Coûts récurrents indicatifs

Tarifs publics à confirmer au moment de la souscription.

| Service | Offre | Coût |
|---|---|---|
| Vercel | Pro (usage commercial) | ~20 USD par mois et par membre |
| Neon | Gratuite au démarrage ; Launch si besoin de sauvegardes plus longues | 0, puis ~20 USD par mois |
| Nom de domaine `.bj` | Annuel | Selon le registraire |
