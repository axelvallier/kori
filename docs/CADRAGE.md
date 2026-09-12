# Kori, cadrage v1

## Problème

Faire ses courses en Finlande sans parler finnois oblige à sortir son téléphone
et à traduire terme à terme devant les rayons. L'effort arrive au pire moment,
debout dans le magasin, alors que la préparation de la liste se fait au calme
à la maison.

## Solution

Une liste de courses dont chaque ligne porte les deux langues. L'utilisateur
saisit en français, le finnois s'affiche à côté. En rayon, il ne lit que le
finnois. Un connecteur Claude permet de coller une recette et de voir la liste
se remplir toute seule.

## Périmètre v1

Dans le périmètre :

* une liste par compte, multi-utilisateur dès le départ
* saisie française avec quantité optionnelle
* affichage bilingue, finnois dominant
* cocher, supprimer, vider les cochés
* groupement par rayon
* application installable sur Android depuis Chrome, sans passer par un magasin
* connecteur Claude (MCP) pour lire et écrire la liste
* enrichissement du lexique par le connecteur

Hors périmètre :

* finnois vers français, ou toute autre paire de langues
* partage de liste entre plusieurs personnes
* prix, magasins, stocks, promotions
* photos, code-barres, scan
* import automatique depuis un site de recettes
* publication sur un magasin d’applications

## Décisions techniques

### D1. Next.js sur Vercel, Supabase pour la base et l'auth

Un seul repo pour le front, l'API et la route MCP. Vercel déploie sur push,
Supabase fournit Postgres, l'authentification et les politiques de sécurité au
niveau des lignes. Les deux ont un palier gratuit suffisant pour cet usage.

### D2. Lexique maison, pas de traduction automatique

Le vocabulaire des courses est petit et fermé. Un traducteur générique se
trompe régulièrement sur les produits alimentaires (crème fraîche, fromage
blanc, les coupes de viande) et ne connaît pas les marques et formats
finlandais. Une table de termes vérifiés donne un meilleur résultat, coûte zéro
euro, et répond instantanément.

Conséquence assumée : le lexique est incomplet au départ. Un terme inconnu ne
bloque rien, l'item est créé avec la mention "traduction manquante". C'est
Claude, via le connecteur, qui comble le trou en écrivant dans le lexique.
L'application s'améliore donc à l'usage, sans appel payant à chaque saisie.

Le lexique est global et partagé entre tous les comptes : une traduction
ajoutée par un utilisateur profite aux suivants.

### D3. Connecteur MCP authentifié par jeton d'URL

Un connecteur MCP distant multi-utilisateur demande normalement un flux OAuth
complet côté serveur. Pour la v1, l'utilisateur génère dans ses réglages un
jeton personnel et colle dans Claude une URL qui le contient, de la forme
`https://kori.app/api/mcp/<jeton>`. Le jeton est stocké haché, révocable, et
détermine à lui seul l'utilisateur dont on lit et écrit la liste. OAuth pourra
remplacer ce mécanisme plus tard sans toucher aux outils exposés.

### D4. Le finnois est l'information principale

En rayon, le mot utile est le finnois. Chaque ligne affiche donc le finnois en
grand et le français en sous-titre, à l'inverse du sens de saisie.

### D5. Android d'abord, application web installable, pas de magasin d'applications

Le porteur du projet est sur Android. Ce détail change la réponse à la question
de l'application native : sur Android, une application web installée depuis
Chrome génère une WebAPK, un paquet signé qui la place dans le tiroir
d'applications et dans les paramètres système, et elle peut s'inscrire dans la
feuille de partage du système via le champ `share_target` du manifeste.

Les deux limites qui justifieraient du natif sur iOS, l'absence d'intégration
système et l'impossibilité de recevoir un partage, n'existent donc pas ici. La
v1 ne vise aucun magasin d'applications. Si le besoin apparaît plus tard,
Bubblewrap emballe la même application dans une Trusted Web Activity en quelques
heures, pour vingt-cinq dollars une fois, sans changer le rythme de déploiement
ni le code.

Conséquence sur les lots : l'installabilité passe du lot de finition au lot M1,
parce qu'une liste de courses qu'on ouvre depuis le tiroir d'applications n'est
pas la même chose qu'un onglet à retrouver.

## Modèle de données

* `profiles` : un enregistrement par compte
* `lists` : une liste par compte en v1, la table permet d'en avoir plusieurs plus tard
* `list_items` : rattaché à une liste, porte le texte saisi, la quantité, l'état coché, et une référence optionnelle vers un terme
* `terms` : le lexique global, français normalisé unique, finnois, rayon
* `mcp_tokens` : jetons de connecteur, hachés, rattachés à un compte

Un item sans `term_id` est un item dont la traduction manque. C'est le seul
état à gérer, il n'y a pas de file d'attente séparée.

## Lots

| Lot | Contenu | Objectif |
|---|---|---|
| M0 | Socle | le squelette déployé et la base en place |
| M1 | Liste utilisable | faire ses courses avec, sans Claude, depuis une application installée |
| M2 | Connecteur Claude | la recette qui remplit la liste |
| M3 | Lexique et rayons | rendre l'app autonome et le parcours du magasin efficace |
| M4 | Finition mobile | hors ligne, et réception d’un partage depuis une autre application |

Le week-end vise M0 à M2. M3 et M4 suivent.

## Critère de réussite

Coller une recette dans Claude, arriver au S-market, faire ses courses sans
ouvrir de traducteur une seule fois.
