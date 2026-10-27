# PROXIMA CONNECT — Note de cadrage technique

*Version 0.1 — octobre 2026. Réponse au livrable n° 1 du cahier des charges (section 10).*

Cette note fixe les choix d'architecture, le modèle de données, la liste des écrans et le découpage de la Phase 1. Elle suit la consigne du cahier des charges : une première version simple (formulaire + base de données + outil de gestion + tableau de bord). On n'investit pas dans la technique tant que le modèle économique n'est pas validé.

---

## 1. Architecture retenue

```
Navigateur (ordinateur ou téléphone)
        │  HTTPS, pages rendues côté serveur, très peu de JavaScript
        ▼
Application web Next.js (un seul programme)
  ├─ pages publiques : formulaire d'inscription des intervenants
  ├─ back-office : profils, clients, missions, preuves, tableau de bord
  └─ actions serveur : contrôle des droits, validation, journal
        │  SQL (TLS)
        ▼
Base PostgreSQL hébergée (Neon)
```

Un seul programme sert à la fois le formulaire public et le back-office. Il n'y a pas d'API séparée ni d'application mobile en Phase 1. Ce choix suit la section 14 du dossier stratégique.

### Technologies

| Élément | Choix | Raison |
|---|---|---|
| Application | Next.js 15 (React 19, TypeScript) | Un seul langage du formulaire jusqu'à la base. Les pages sont rendues côté serveur, donc légères pour une connexion de terrain. |
| Mise en page | Tailwind CSS 4 | Interface sobre et cohérente, sans bibliothèque de composants lourde. |
| Base de données | PostgreSQL, hébergé chez Neon | Base relationnelle standard, adaptée aux recherches multicritères. Sauvegardes et branches de test incluses. Rien à administrer. |
| Accès base | `pg` (pilote PostgreSQL officiel) | Pas d'ORM : le SQL reste lisible et migrable vers n'importe quel hébergeur PostgreSQL. |
| Authentification | Comptes internes, mot de passe haché (scrypt), session par cookie `httpOnly` | Sans dépendance externe. Les droits sont contrôlés côté serveur à chaque page et à chaque action. |
| Hébergement | Vercel (application) + Neon (base), région Europe | Rien à installer, mise en ligne en quelques minutes. Un VPS reste possible plus tard sans changer le code. |

### Pourquoi pas plus simple (Google Forms + tableur) ?

Un tableur suffit pour quelques dizaines de profils. Il ne tient pas les exigences du cahier des charges : accès restreint par rôle aux données sensibles, journal des modifications, statuts suivis, recherche multicritères et lien entre profils, missions, preuves et paiements. La solution retenue garde la même simplicité d'usage : un formulaire et des listes filtrables.

---

## 2. Rôles et droits

| Rôle | Accès en Phase 1 |
|---|---|
| Administrateur | Tout, plus la gestion des comptes et le journal |
| Chargé(e) de recrutement | Profils : lecture, modification, vérification, changement de statut |
| Chargé(e) de mission / superviseur | Profils en lecture ; missions, sélection, preuves, incidents |
| Commercial | Clients et briefs ; profils en lecture (sans pièce d'identité ni moyen de paiement) |
| Direction | Tableau de bord et lecture de tout, sans modification |
| Intervenant | Aucun accès en Phase 1 (lecture de son profil prévue en Phase 2) |

Les données sensibles (numéro de pièce d'identité, coordonnées de paiement) sont masquées pour les rôles qui n'en ont pas l'usage. Chaque consultation ou modification d'une fiche sensible est inscrite au journal.

---

## 3. Modèle de données

Toutes les tables sont créées dès la Phase 1, même celles des modules qui viendront ensuite. Cela évite une refonte de la base plus tard.

| Table | Contenu | Module |
|---|---|---|
| `intervenant` | Identité, coordonnées, localisation et zones, formation, situation, compétences, langues, disponibilités, déplacement, types de missions acceptés, vérifications, moyen de paiement, consentement horodaté, statut | 5.1 |
| `client` | Raison sociale, secteur, contact, facturation, conditions de paiement, limite de crédit (FCFA), statut commercial | 5.2 |
| `brief` | Demande client : objectif, catégorie, zone, nombre de profils, dates, horaires, compétences, budget, livrables | 5.2 |
| `mission` | Mission créée depuis un brief : catégorie, zone, dates, rémunération par agent, score minimum, statut (8 étapes) | 5.3 |
| `affectation` | Lien mission ↔ intervenant : titulaire ou remplaçant, proposition, réponse, présence | 5.3 |
| `preuve` | Formulaire, photo, géopoint, signature, contre-appel ; validation ou rejet motivé | 5.4 |
| `controle` / `incident` | Contrôles qualité ; incidents avec gravité et résolution | 5.4 |
| `evaluation` / `critere_score` / `score_historique` | Notes par critère, pondérations paramétrables, historique du score, contestation | 5.5 |
| `paiement_intervenant` / `facture` | Paiements dus par mission (à payer, payé, en litige) ; acomptes et factures clients, échéances | 5.6 |
| `communication` | Notifications et échanges par SMS ou WhatsApp, rattachés au profil et à la mission | 5.8 |
| `utilisateur` / `session` / `journal` | Comptes internes, sessions, traçabilité des accès et modifications | 8.1 |

Le statut d'un profil suit ce cycle :

```
en attente ──(vérification complète)──▶ vérifié ──▶ actif
     │                                      │          │
     └──────────────▶ suspendu ◀────────────┴──────────┘
                         │
                         ▼
                      inactif
```

Pour passer un profil en « vérifié », il faut que les quatre contrôles du cahier des charges soient cochés :

- pièce d'identité contrôlée ;
- âge d'au moins 18 ans ;
- téléphone joignable ;
- moyen de paiement traçable.

L'âge est contrôlé automatiquement dès l'inscription. Les numéros béninois sont normalisés au format à 10 chiffres (`01…`), en vigueur depuis la migration de la numérotation.

---

## 4. Écrans

| Écran | Public | Phase |
|---|---|---|
| Formulaire d'inscription intervenant | Public, sans compte | 1 |
| Connexion | Équipe | 1 |
| Tableau de bord | Équipe | 1 (base), 2 (complet) |
| Liste des profils, avec filtres (zone, disponibilité, compétences, statut, score) | Recrutement, mission | 1 |
| Fiche profil : vérification, statut, historique, journal | Recrutement | 1 |
| Clients et briefs | Commercial | 1 |
| Création de mission et sélection des profils compatibles | Mission | 1 |
| Suivi de mission : propositions, présence, remplacements, preuves, incidents | Mission | 1 |
| Rapport de mission exportable | Mission, client | 2 |
| Paiements et factures | Administration | 2 |
| Comptes utilisateurs, journal | Administrateur | 1 |

---

## 5. Exigences non fonctionnelles

- **Connexion limitée** : les pages sont rendues côté serveur et pèsent quelques dizaines de Ko. Pas d'image décorative ni de police téléchargée. Le formulaire d'inscription fonctionne même avec un JavaScript bloqué.
- **Mobile** : toutes les pages sont lisibles sur téléphone. Le formulaire d'inscription est conçu d'abord pour le téléphone, car la plupart des intervenants s'inscriront depuis le leur.
- **Sécurité** : mots de passe hachés, cookies de session `httpOnly`, contrôle des droits côté serveur et journal des modifications. Base chiffrée au repos et en transit (Neon).
- **Protection des données** : le consentement est horodaté et versionné à l'inscription. La conformité au Code du numérique béninois (livre V, protection des données à caractère personnel) et la déclaration auprès de l'APDP restent à faire valider par un conseil juridique avant la mise en production.
- **Évolutivité** : le SQL est standard et l'application est unique. Pour aller vers les phases suivantes (sélection automatisée, notifications, application mobile), on ajoutera des modules, sans refonte.

---

## 6. Découpage de la Phase 1 et estimation

| Lot | Contenu | Charge estimée |
|---|---|---|
| 0 | Socle : projet, base, comptes, rôles, journal, déploiement | 3 j |
| 1 | Module 5.1 : inscription publique, profils, vérification, recherche | 4 j |
| 2 | Module 5.2 : clients et briefs | 3 j |
| 3 | Module 5.3 : missions, sélection, propositions, remplacements | 5 j |
| 4 | Module 5.4 : preuves, contrôles, incidents | 4 j |
| 5 | Tableau de bord de base, exports CSV | 2 j |
| 6 | Recette, documentation utilisateur, mise en production | 3 j |
| | **Total Phase 1** | **≈ 24 jours de développement** |

### Coûts récurrents indicatifs

Ce sont des tarifs publics à confirmer au moment de la souscription.

- Base Neon : offre gratuite suffisante pour le volume visé à 12 mois (500 profils, une centaine de missions). Offre payante d'entrée vers 20 USD/mois si l'on veut plus de rétention des sauvegardes.
- Hébergement de l'application : Vercel Pro vers 20 USD/mois par membre, l'offre gratuite étant réservée à un usage non commercial. Un VPS à environ 10 USD/mois est une alternative.
- SMS et WhatsApp Business (Phase 2) : facturés au message selon le fournisseur retenu.

---

## 7. Points à trancher par PROXIMA

1. **Pièce d'identité** : faut-il stocker le scan, ou seulement le type, le numéro et la mention « contrôlée par … le … » ? La seconde option réduit fortement le risque lié aux données. C'est l'option retenue par défaut en Phase 1.
2. **Pondération du PROXIMA SCORE** : les poids des 8 critères sont paramétrables. Il faut fixer leurs valeurs de départ.
3. **Fournisseurs** : choix des fournisseurs SMS, WhatsApp Business et Mobile Money (MTN MoMo, Moov Money, Celtiis Cash) pour la Phase 2.
4. **Données à conserver** : durée de conservation des données d'un intervenant devenu inactif.
