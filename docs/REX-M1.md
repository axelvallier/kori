# Retour d'expérience, lot M1

Session du 13 septembre 2026. Axel Vallier, avec Claude Code.

Même rôle que `REX-M0.md`, pour le lot suivant : la mémoire de la
**réalisation**, pas celle du cadrage. Les décisions techniques nouvelles vont
dans `CADRAGE.md` en `D<n>` — une seule est née ici, **D7**, le flux PKCE côté
serveur.

## État à la fin de M1

| Ticket | Issue | PR | |
|---|---|---|---|
| 05 Authentification par lien magique | #10 | #33 | à fusionner |
| 06 Profil et liste par défaut | #11 | #34 | à fusionner |
| 07 Résolution de la traduction | #12 | #35 | à fusionner |
| 08 Écran de liste bilingue | #13 | #36 | à fusionner |
| 09 Cocher, supprimer, vider | #14 | #37 | à fusionner |
| 10 Quantités dans la même ligne | #15 | #38 | à fusionner |
| 19 Application installable | #24 | #39 | à fusionner |

**Les sept pull requests sont empilées**, chacune basée sur la précédente, dans
l'ordre du tableau. Elles se fusionnent donc dans cet ordre. En fusion écrasée,
chaque fusion réécrit les SHA de sa base : la suivante demandera un
`git rebase --onto main <branche précédente> <branche suivante>`. C'est le piège
que `REX-M0.md` décrit déjà, et il coûte quinze minutes par oubli.

## Les pièges, par ordre de coût

### Le lexique écrivait « œuf », personne ne tape « œuf »

Le ticket 07 nomme trois pièges à garder verts : `ananas`, `riz`, `oeufs`. Les
deux premiers passaient déjà. Le troisième était un vrai bug, et seul le lexique
réel le révélait : il contient `œuf`, `bœuf`, `œufs de poisson` et
`viande hachée de bœuf`, **avec la ligature**. `normalize("oeufs")` donnait
`oeuf`, la base portait `œuf`, et deux des mots les plus probables d'une liste
de courses ne trouvaient rien.

`normalize()` remplace donc « œ » par « oe » et « æ » par « ae ».

**La leçon est plus large que la ligature** : une règle de normalisation ne se
valide pas sur des exemples inventés, elle se valide contre le contenu réel de
la table. Les tests unitaires du ticket 07 étaient verts avant la correction.

### Le coût annoncé était le bon

`terms` n'a aucune politique d'update : changer la règle de normalisation impose
une migration qui réécrit `fr_normalized`. `REX-M0.md` l'avait prévu, et
c'est exactement ce qui s'est passé — quatre lignes, plus une garde contre la
collision si la forme sans ligature existe déjà.

**Les accents restent donc ouverts, et le coût grandit avec le lexique.**
`crème fraîche` et `creme fraiche` sont toujours deux formes distinctes, et la
seconde ne trouve rien. C'est le ticket 18 qui doit trancher, en même temps que
la règle SQL équivalente. La question est maintenant consignée dans le
commentaire de `normalize()` pour qu'elle ne se reperde pas.

### `created_at` n'est pas l'ordre d'ajout

Réflexe naturel pour ordonner une liste : trier par date de création. C'est faux
ici. `now()` renvoie l'heure de **début de transaction**, donc plusieurs items
insérés d'un seul coup la partagent à la microseconde près — et c'est exactement
ce que fera le connecteur du lot M2 en lisant une recette. L'ordre de la recette
serait perdu.

D'où `position`, lue puis incrémentée à l'insertion, `created_at` ne servant
plus qu'à départager deux ajouts simultanés.

**Pour le ticket 13** : le connecteur devra attribuer lui-même des positions
croissantes à un lot d'items, un `insert` multi-lignes ne peut pas s'en remettre
à un déclencheur — un déclencheur `before insert` ne voit pas les lignes
insérées par la même commande.

### psql n'interpole pas ses variables dans un bloc `do $$`

`isolation.sql` mélangeait déjà `:'utilisateur_a'` en dehors des blocs et des
UUID en toutes lettres dedans, sans que la raison soit écrite. Elle est là : les
variables psql ne sont pas substituées à l'intérieur d'une chaîne entre
dollars. Le ticket 06 a donc dû fixer les identifiants de liste par un `update`
après coup, puisque le déclencheur les crée désormais lui-même.

### Le test qui sabote le mauvais objet

Six sabotages joués sur le provisionnement. Le sixième, le retrait de la
cascade, a d'abord « réussi » en affichant une erreur — mais l'erreur venait du
déclencheur encore supprimé par le sabotage précédent. **Un sabotage se joue sur
une base saine, un seul à la fois.** Rejoué proprement, il donne bien
`violates foreign key constraint`.

Même famille d'erreur côté navigateur : un test d'ajout a d'abord déconnecté
l'utilisateur, parce que `document.querySelector('form')` attrapait le
formulaire de déconnexion, premier dans le DOM. Le résultat était incompréhensible
— zéro ligne, aucune erreur — jusqu'à ce qu'on comprenne que la page avait
changé. **Quand une mesure surprend, soupçonner la mesure avant le code.**

## Ce qui a bien marché

### Piloter Chrome au protocole DevTools

Trois critères d'acceptation du lot ne se vérifient pas en lisant le code :
« dix items sans défilement », « cocher pendant une coupure réseau d'une
seconde », « Chrome propose réellement l'installation ». Un script Node d'une
centaine de lignes, une WebSocket vers Chrome sans interface, un cookie de
session injecté par `Network.setCookie`, et les trois deviennent des nombres.

Ce que ça a permis, concrètement :

* mesurer la hauteur réelle des lignes et le bas de la dixième, plutôt que
  d'estimer à partir de la taille de police ;
* couper le réseau par `Network.emulateNetworkConditions` et compter les
  requêtes, ce qui a prouvé la reprise **et** la coalescence des appuis ;
* interroger `Page.getInstallabilityErrors`, qui répond ce que Chrome
  répondrait sur un téléphone ;
* ralentir le processeur quatre fois pour que la mesure de temps de chargement
  ressemble à un téléphone et non à un MacBook.

Les scripts vivent dans le répertoire de travail temporaire de la session, pas
dans le dépôt : ils dépendent d'un chemin vers Chrome et d'un cookie de session
réel. À réécrire si le besoin revient, ou à verser dans le dépôt le jour où il
faudra les rejouer en intégration continue.

### Saboter, encore

La méthode de `REX-M0.md` a resservi trois fois : six sabotages sur le
provisionnement, trois sur l'installabilité. Le plus instructif est celui qui
**ne** produit rien : retirer l'icône 512 du manifeste ne fait échouer aucune
vérification d'installabilité, parce que le seuil de Chrome se contente d'une
icône de 144 points. L'icône 512 et l'icône masquable servent la qualité de la
WebAPK — écran de démarrage, icône adaptative — pas le seuil. Sans le sabotage,
on aurait cru l'inverse.

### Lire le paquet installé, encore

`@supabase/ssr` passe des en-têtes de non-mise en cache en second argument de
`setAll` ; `REX-M0.md` l'avait repéré, le ticket 05 s'en sert. Toute réponse qui
pose un cookie de session les porte. Sur Vercel, qui est un CDN, l'oubli se
paierait en jetons servis d'un utilisateur à un autre.

Next 16 a par ailleurs renommé `middleware.ts` en `proxy.ts`, avec la fonction
`proxy` et le runtime Node par défaut. La documentation embarquée dans
`node_modules/next/dist/docs/` le dit ; un exemple trouvé en ligne aurait donné
l'ancien nom.

### Le sous-agent `revue-securite`, enfin lancé

Il n'avait jamais tourné pendant M0. Sur les deux migrations du lot, il a sorti
deux vraies prises, corrigées avant fusion.

**La garde anti-collision cédait une entrée du lexique en silence.** La
migration des ligatures laissait la ligne à ligature en place si la forme sans
ligature existait déjà, et terminait sans rien dire. Or n'importe quel
utilisateur authentifié peut écrire dans `terms` : la politique d'insertion ne
vérifie que `created_by = auth.uid()`, jamais que `fr_normalized` vaille bien
`normalize(fr)` — c'est précisément le trou que le ticket 18 doit fermer.
Quelqu'un pouvait donc déposer un « boeuf » de son choix avant que la migration
ne tourne : la garde l'aurait pris pour un jumeau légitime, la vraie ligne
serait restée sur « bœuf », et serait devenue définitivement injoignable, `terms`
n'ayant ni update ni delete. La migration échoue désormais bruyamment en nommant
les lignes restées.

**Le rattrapage ressuscitait les comptes supprimés.** Supabase supprime en
douceur : la ligne reste dans `auth.users` avec `deleted_at` renseignée. Sans
filtre, un compte effacé à la demande de son propriétaire se revoyait attribuer
un profil neuf et une liste.

La troisième constatation était un faux positif instructif : l'agent affirmait
que le déclencheur rendait `isolation.sql` inexécutable. C'est vrai de la
version présente sur `main`, et l'adaptation vit sur la branche du ticket 06 —
l'agent a lu l'arbre de travail pendant un changement de branche. **Un
sous-agent lit le disque, pas la branche qu'on croit.** Le lancer sur un arbre
stable, ou lui donner les chemins des fichiers versionnés à comparer.

Les deux corrections ont été reportées dans la pile par fusions successives
plutôt que par rebasage : réécrire l'historique de six branches déjà poussées
aurait demandé autant de poussées forcées.

## Questions laissées ouvertes

**Les accents dans `normalize()`.** Toujours ouverte, et plus chère à chaque
terme ajouté. Voir plus haut.

**Dix items tiennent en 711 points.** Sans défilement à partir de 712 points de
hauteur utile — le cas de l'application installée sur un 360 × 800. Dans un
onglet Chrome avec la barre d'adresse, il reste une soixantaine de points à
faire défiler. Tenir aussi ce cas demanderait des lignes d'environ 44 points,
donc un finnois autour de 18, ce qui coûte le critère « lisible à bout de bras ».
Arbitrage rendu en faveur de la lisibilité. À rejuger après quelques courses.

**Le rayon de `tofu`, `seitan` et `härkis`.** Inchangée depuis M0.

**Corriger une traduction fausse.** Inchangée depuis M0, et le ticket 14 approche.

## Ce que M2 demandera

Le ticket 12, l'endpoint MCP, reste la pièce la plus risquée. Trois choses du
lot M1 le concernent directement :

* **`resolveTerm(supabase, fr)` prend son client en argument.** Le connecteur
  apportera le sien, à clé secrète. Rien à changer dans `terms.ts`.
* **Le filtrage s'inverse.** Tout le code de M1 s'en remet à RLS et n'écrit
  aucun filtre sur le compte, volontairement. La route du connecteur travaille
  avec la clé secrète, qui contourne RLS : elle doit tout filtrer à la main, à
  chaque requête. Voir `.claude/rules/route-mcp.md`.
* **`api/` est hors du matcher du proxy**, pour que la route du connecteur ne
  soit pas redirigée vers `/login`. C'est déjà fait.

## En attente côté humain

* **Réglage Supabase du projet hébergé**, sans lequel le dernier critère du
  ticket 05 ne peut pas être vérifié. Authentication → URL Configuration :
  Site URL `https://kori-6p7o.vercel.app`, Redirect URLs
  `http://localhost:3000/**` et `https://kori-6p7o-*.vercel.app/**`. Le local
  porte déjà l'équivalent dans `supabase/config.toml`.
* **Vérifier la WebAPK sur un vrai téléphone.** Chrome sans interface dit que
  rien ne s'oppose à l'installation ; la présence de l'entrée dans le tiroir et
  dans les paramètres système se constate sur l'appareil.
* **Le sous-agent `revue-securite`** a tourné sur les deux migrations du lot, et
  y a trouvé deux vraies prises (voir plus haut). Il reste à le lancer sur la
  route du connecteur au lot M2, où il compte double : la clé secrète y
  contourne RLS.
* **Signalement privé de failles** et **pull requests Dependabot** : inchangé
  depuis M0.
