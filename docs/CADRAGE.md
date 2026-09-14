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

### D6. Clés d'API Supabase au nouveau format

Supabase a remplacé les clés `anon` et `service_role`, qui étaient des jetons
JWT, par une clé publiable (`sb_publishable_…`) et une clé secrète
(`sb_secret_…`). Les anciennes restent valides mais sont annoncées comme
dépréciées d'ici fin 2026, soit quelques mois après le début de ce projet.

Le projet part donc directement sur le nouveau format, et les variables
d'environnement prennent les noms correspondants :
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY`. Le premier suit
la convention du guide de démarrage officiel de Supabase pour Next.js, ce qui
évite d'avoir à traduire mentalement chaque exemple de la documentation.

Option écartée : conserver les noms `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` en y mettant les valeurs du nouveau format. Le
câblage aurait été strictement identique, mais chaque nom aurait désigné une clé
qui n'existe plus. C'est le genre d'écart qui ne coûte rien le premier jour et
une heure de confusion six mois plus tard, quand personne ne se souvient
pourquoi la variable ne porte pas le nom de ce qu'elle contient.

Ce qui ne change pas : la clé secrète contourne toutes les politiques de
sécurité au niveau des lignes. Elle reste côté serveur, et ne prend jamais un nom
préfixé `NEXT_PUBLIC_`.

### D7. Le lien magique s'échange côté serveur, en PKCE

L'authentification par lien magique peut se câbler de deux façons. La plus
répandue fait tout depuis le navigateur : le client Supabase demande le lien, et
la page de retour échange le code contre une session en JavaScript. Kori fait
l'inverse — la demande part d'une action serveur, et `/auth/callback` est une
route serveur.

Trois raisons, dans l'ordre où elles pèsent :

L'adresse saisie est **validée côté serveur avec zod**, comme toute entrée
utilisateur de ce projet. Une validation faite dans le navigateur n'est qu'un
confort d'affichage.

Les cookies de session sont posés par le serveur, donc `httpOnly`. Une
déconnexion depuis le navigateur laisserait des cookies que le JavaScript ne
peut pas effacer.

Le flux reste **PKCE de bout en bout** : l'action serveur dépose un vérificateur
dans un cookie, et l'échange n'aboutit que si le code reçu par email lui répond.

**Conséquence assumée, et elle se présentera comme un bug** : un lien magique
ouvert sur un autre appareil que celui qui l'a demandé échoue. Le vérificateur
est dans le navigateur d'origine. C'est le prix de PKCE, et c'est aussi sa
protection — un lien intercepté ne suffit pas à ouvrir une session. L'écran de
connexion le dit en toutes lettres au lieu d'afficher une erreur technique.

Option écartée : le flux implicite, sans vérificateur, qui aurait laissé le lien
fonctionner depuis n'importe quel appareil. Il fait transiter le jeton dans le
fragment de l'URL, où seul le navigateur le voit — donc un échange côté serveur
devient impossible, et les deux premières raisons ci-dessus tombent avec lui.

### D8. Le lexique partagé est borné en forme, pas modéré en contenu

La décision D2 rend le lexique global : n'importe quel compte authentifié peut
y insérer un terme, et la traduction profite à tous les suivants. Le ticket 14
ajoute la conséquence qui manquait — le finnois d'un terme est **recopié tel
quel dans ce que Claude lit** quand il ajoute un produit à une liste.

Un compte peut donc déposer une traduction dont le texte est mis en forme comme
une consigne, en espérant qu'un autre compte demande ce produit-là. Aucune
donnée ne fuit, et l'effet dépend entièrement de ce que le modèle fait d'un
texte qui n'est pas une instruction — mais le vecteur existe, et il a été
trouvé par la relecture de sécurité du lot M2, pas par l'usage.

Ce qui a été fait : une contrainte en base borne la **forme** des entrées —
80 caractères, une seule ligne, pour le français comme pour le finnois. La
contrainte est en base et non dans le connecteur, parce que le connecteur n'est
pas le chemin d'écriture : la politique `terms_insert_authenticated` autorise
déjà l'insertion directe par la Data API avec la clé publiable. Une validation
dans la route aurait borné un chemin sur deux.

Ce qui n'a pas été fait, et c'est le cœur de la décision : **rien ne modère le
sens**. Une traduction fausse, ou insultante, reste possible. C'est le prix de
D2, et il est payé en connaissance de cause tant qu'il n'y a qu'un utilisateur.

Options écartées :

*Réserver l'écriture du lexique à un compte administrateur.* Elle referme le
seul mécanisme qui rend l'application auto-réparatrice, pour un risque qui
n'existe qu'à partir du deuxième utilisateur.

*Échapper le finnois avant de le donner à Claude.* Il n'y a rien à échapper :
le danger n'est pas un caractère, c'est une phrase. Borner la longueur et
interdire les sauts de ligne retire ce qui rend un texte crédible comme
consigne, sans prétendre lire dans le sens.

Ce qui déclenchera la reprise de cette décision : l'arrivée d'un deuxième
utilisateur qui n'est pas de confiance. La même condition que la fermeture des
inscriptions, notée dans `docs/REX-M1.md`.

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
