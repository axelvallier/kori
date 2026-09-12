# Backlog Kori

Vingt et un tickets, cinq lots. Le détail de chaque ticket vit dans `docs/tickets/`,
un fichier par ticket, poussé vers GitHub Issues par `scripts/bootstrap-github.mjs`.

## M0 Socle

| # | Ticket | Taille | Domaine |
|---|---|---|---|
| 01 | Initialiser l'application Next.js et le déploiement Vercel | S | front |
| 02 | Créer le projet Supabase et câbler les clients | S | db |
| 03 | Schéma de données et politiques de sécurité | M | db |
| 04 | Constituer et importer le lexique initial | M | db |

## M1 Liste utilisable

| # | Ticket | Taille | Domaine |
|---|---|---|---|
| 05 | Authentification par lien magique | M | auth |
| 06 | Provisionner le profil et la liste par défaut | S | db |
| 07 | Résoudre la traduction d'un terme à l'ajout | M | db |
| 08 | Écran de liste avec affichage bilingue | M | front |
| 09 | Cocher, supprimer, vider les cochés | S | front |
| 10 | Quantités saisies dans la même ligne | S | front |
| 19 | Application installable sur Android et lisible en magasin | M | front |

## M2 Connecteur Claude

| # | Ticket | Taille | Domaine |
|---|---|---|---|
| 11 | Générer et révoquer les jetons de connecteur | M | auth |
| 12 | Endpoint MCP distant | L | mcp |
| 13 | Outils MCP de manipulation de la liste | M | mcp |
| 14 | Outils MCP d'enrichissement du lexique | M | mcp |
| 15 | Documenter le branchement du connecteur | S | doc |

## M3 Lexique et rayons

| # | Ticket | Taille | Domaine |
|---|---|---|---|
| 16 | Écran de lexique et traductions manquantes | M | front |
| 17 | Grouper la liste par rayon dans l'ordre du magasin | M | front |
| 18 | Extraire la normalisation et verrouiller les doublons | S | db |

## M4 Finition mobile

| # | Ticket | Taille | Domaine |
|---|---|---|---|
| 20 | Consultation hors ligne et écritures différées | L | front |
| 21 | Recevoir un partage depuis une autre application Android | L | front |

## Ordre d’attaque

Les lots se font dans l’ordre, avec deux exceptions.

Le ticket 12, l’endpoint MCP, est la pièce la plus risquée du projet : il faut le
faire répondre `ping` dès le premier jour pour savoir tôt si le montage tient.
Le reste du lot M2 attend M1.

Le ticket 19, l’installabilité, a quitté le lot de finition pour M1 : sur Android
une application web installée est indistinguable d’une application native, et
c’est ce qui fait la différence entre un onglet à retrouver et une application
qu’on ouvre par réflexe.
