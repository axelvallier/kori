# Retour d'expérience, lot M2

Session du 14 septembre 2026. Axel Vallier, avec Claude Code.

Même rôle que `REX-M0.md` et `REX-M1.md` : la mémoire de la **réalisation**, pas
celle du cadrage. Une décision technique est née ici, **D8**, sur ce que borne
et ne borne pas un lexique partagé.

## État à la fin de M2

| Ticket | Issue | PR | |
|---|---|---|---|
| 11 Générer et révoquer les jetons | #16 | #51 | fusionné |
| 12 Endpoint MCP distant | #17 | #58 | fusionné |
| 13 Outils de manipulation de la liste | #18 | #53 | fusionné |
| 14 Outils d'enrichissement du lexique | #19 | #54 | fusionné |
| 15 Documenter le branchement | #20 | #55 | fusionné |

Plus #60, la correction du vocabulaire des recettes, trouvée après coup à la
première vraie utilisation — voir les pièges.

**Les cinq pull requests étaient empilées**, chacune basée sur la précédente,
dans l'ordre du tableau. Même piège qu'au lot M1, même remède : en fusion
écrasée, chaque fusion réécrit les SHA de sa base, et la suivante demande un
`git rebase --onto main <précédente> <suivante>`.

Deux frictions que la pile a coûtées, et qui ne figuraient dans aucun retour
d'expérience précédent :

**`--delete-branch` ferme les pull requests enfants.** GitHub ferme
automatiquement une pull request dont la branche de base disparaît, et la
fermeture est **irréversible** : ni réouverture, ni changement de base. Le
ticket 12 a dû repartir sous un nouveau numéro, #58. L'ordre correct est de
**retarger l'enfant sur `main` avant** de fusionner et supprimer sa base.

**« Ferme #17 » ne ferme rien.** GitHub ne reconnaît que `closes`, `fixes` et
`resolves`, en anglais. Les cinq pull requests annonçaient la fermeture en
français : aucune issue ne s'est fermée, et il a fallu les fermer à la main.

Le connecteur expose neuf outils : `ping`, `get_list`, `add_items`,
`check_items`, `uncheck_items`, `remove_items`, `clear_checked`,
`list_missing_translations`, `add_translation`.

## Les pièges, par ordre de coût

### Le garde-fou qui ne pouvait pas se déclencher

Le meilleur du lot, et il n'a été trouvé qu'en vérifiant une **autre**
correction.

Le rattachement rétroactif du ticket 14 lit les lignes non traduites pour les
comparer en TypeScript, donc il les plafonne — `limit(2000)` — et prévient dans
les journaux quand le plafond est atteint : `if (lignes.length === PLAFOND)`.
Raisonnement juste, condition impossible. **PostgREST applique son propre
plafond**, `max_rows = 1000` dans `supabase/config.toml`, et il gagne toujours :
demander deux mille lignes en rend mille, sans erreur, sans en-tête d'alerte,
sans rien dire. La comparaison à la constante du code n'était donc jamais vraie,
sur une troncature bien réelle.

Le symptôme observé était ailleurs : un rattachement de 250 lignes n'en touchait
qu'une seule. C'est en cherchant pourquoi le plafond n'avait pas prévenu qu'on
a trouvé qu'il ne pouvait pas.

La correction ne rattrape pas la constante, elle la retire du raisonnement :
`count: "exact"` donne le nombre total de lignes qui correspondent, à comparer
au nombre reçu. La détection ne dépend plus d'aucune valeur écrite dans le code.

**La leçon dépasse ce cas** : une garde qui compare une mesure à une limite
qu'on croit connaître ne teste que sa propre cohérence. Il faut la comparer à
une mesure indépendante — et c'est la troisième fois du projet qu'un contrôle
passe pour la mauvaise raison (voir `REX-M0.md`).

### `[[:cntrl:]]` n'attrape pas ce qu'on croit

La migration qui borne la forme des entrées du lexique devait garantir « une
seule ligne ». Écrite d'abord avec `fi !~ '[[:cntrl:]]'`, ce qui semble évident.

Vérifié avant de la figer, sur la base elle-même : `[[:cntrl:]]` attrape le saut
de ligne, mais **pas** U+2028 (séparateur de ligne), **pas** U+200B (espace de
largeur nulle), **pas** U+202E (inversion du sens d'écriture, qui affiche un
texte à l'envers de ce qu'il contient). Trois façons de contourner la contrainte
en une insertion.

La classe est maintenant explicite, écrite en échappements `\uXXXX` — un
caractère invisible en clair dans une migration donne une contrainte dont
personne ne peut relire le contenu — et **sabotée** après coup : sept écritures
directes par la Data API, six refusées, la septième, un terme finnois légitime
avec ses diacritiques, acceptée.

### `insert ... returning` ne rend pas ses lignes dans l'ordre

`add_items` insère toute une recette d'un coup, positions attribuées en mémoire,
puis renvoie à Claude la récapitulation de ce qu'il a ajouté. L'ordre de la
liste était bon en base — et la récapitulation sortait mélangée, différemment
d'un appel à l'autre. PostgREST rend les lignes insérées dans l'ordre qui
l'arrange.

Invisible en lisant le code, évident à l'usage. Trié par `position` désormais.

### Claude range le conditionnement du côté du produit

L'outil prend `fr` et `quantity` séparément, et sa description demande le
produit seul. Claude envoie quand même `{ quantity: "1", fr: "gousse d'ail" }` —
ce qui est raisonnable de sa part, « gousse d'ail » est bien le nom de ce qu'on
achète. Le lexique, lui, cherche « gousse d'ail », ne trouve rien, et `ail` y
est.

La correction ne discipline pas Claude, elle s'adapte : les deux morceaux sont
recollés en « 1 gousse d'ail » et repassés dans `parseEntry`, celui de l'écran,
qui sait déjà découper ça en « 1 gousse » et « ail ». Avec une garde — le
recollage n'est retenu que s'il **produit** une quantité, sinon
`{ quantity: "quelques", fr: "tomates" }` donnerait le produit « quelques
tomates », introuvable.

**Une description d'outil n'est pas une validation.** Elle oriente, elle ne
contraint pas, et le code doit rester juste quand elle n'est pas suivie.

### Le lexique des rayons n'est pas celui des recettes

Trouvé **après la fusion**, à la première vraie utilisation : le connecteur
branché dans Claude, une recette trouvée en ligne, et une liste dont la moitié
des lignes sont illisibles en rayon — « cuillères à soupe concentr… »,
« cuillère à café sucre roux », toutes en traduction manquante.

`parseEntry` connaissait le vocabulaire des **rayons** — paquet, boîte, gousse,
kg. Une recette ne parle pas comme ça : elle ne dit pas « 15 g de persil », elle
dit « 1 cuillère à soupe de persil plat ». Le mot n'étant pas reconnu, tout ce
qui suivait le nombre devenait le produit, avec deux dégâts d'un coup : la ligne
illisible, et sa forme normalisée introuvable au lexique — donc « traduction
manquante » sur `persil`, qui **y est**.

Le détail qui explique l'oubli est une règle de grammaire : **le pluriel d'une
locution se marque au premier mot.** « cuillères à soupe », pas « cuillère à
soupes ». La liste des contenants fabriquait ses pluriels en ajoutant un `s` à
la fin — juste pour `paquet`, faux pour toute locution, et faux aussi pour
`bocal`, qui donnait « bocals » depuis M1 sans que personne ne le voie.

Ce que le cas enseigne au-delà du correctif : **les listes de mots d'un projet
héritent du contexte où elles ont été écrites.** Celles-ci ont été écrites en
pensant à quelqu'un debout dans un magasin, au lot M1, avant qu'il existe une
machine capable de remplir la liste à partir d'un texte de recette. Le lot M2 a
changé la source des données sans que personne ne relise les listes.

### Le plafond global mettait la liste de l'appelant en concurrence

Trouvé par le sous-agent `revue-securite`, et c'est sa plus belle prise du lot.

Le rattachement balayait toutes les lignes non traduites, tous comptes
confondus, sous un plafond unique. Les lignes de celui qui appelle n'avaient
aucune priorité : n'importe qui pouvait, en remplissant sa **propre** liste de
lignes non traduites, faire tomber celles des autres hors de la fenêtre et
désactiver l'auto-réparation pour tout le monde. Sans accès privilégié, sans
rien casser, et sans qu'aucune erreur ne soit levée — l'appelant lisait
« aucune ligne ne l'attendait ».

Deux passes désormais : la liste de l'appelant d'abord, seule, sans plafond
partagé ; les autres comptes ensuite, au mieux. Vérifié avec 3 250 lignes de
bruit dans la liste de l'autre compte.

Même famille, trouvée par le même agent : l'écriture partait en un seul
`id=in.(…)`, que PostgREST passe dans la chaîne de requête. Quelques centaines
d'identifiants suffisent à dépasser la longueur d'URL admise et à faire échouer
l'écriture en bloc. Par lots de cent maintenant — la borne était déjà connue
ailleurs dans le projet, elle avait juste été oubliée ici.

### Tester le workflow de migrations sur une branche pas à jour

Le saut de `supabase/setup-cli` de v1.7.1 à v3.0.0 méritait d'être vérifié et
pas supposé : ce workflow détient le mot de passe de la base. D'où l'idée, juste
en soi, de lancer le workflow sur la branche de Dependabot par
`workflow_dispatch` — aucune migration en attente, donc une exécution qui ne
teste que l'action.

Sauf que cette branche avait été créée **avant** les fusions du lot M2 : quatre
migrations au lieu de cinq. Or ce workflow ne fait pas qu'installer une CLI, il
**compare** les migrations locales au distant. La base ayant une version que la
branche ne connaissait pas, `db push` a refusé :

```
Remote migration versions not found in local migrations directory.
```

**Rien n'a été touché** — l'échec est tombé sur l'étape `--dry-run`, qui est
séparée précisément pour ça, et l'étape d'application a été sautée. C'est la
première fois que cette séparation sert.

Deux choses à retenir, dans l'ordre où elles coûtent :

**La CLI suggère une commande qu'il ne faut surtout pas lancer ici.** Le message
propose `supabase migration repair --status reverted 20260914180000`. Le conseil
est juste dans le cas général — un historique qui contient une version qu'on a
retirée du dépôt. Ici il est faux : cette migration **est** appliquée, et la
marquer annulée ferait mentir l'historique tout en laissant les contraintes en
place, jusqu'à ce qu'une fusion tente de la rejouer. Une suggestion d'outil est
un diagnostic, pas une instruction.

**Une branche sur laquelle on lance ce workflow doit d'abord être rebasée sur
`main`.** Sinon on ne teste pas ce qu'on croit : on teste un désalignement qu'on
a fabriqué soi-même. Rebasée, la même exécution passe — `Remote database is up
to date` au `--dry-run` comme à l'application, et cinq migrations alignées des
deux côtés.

C'est le décalage de `REX-M1.md` pris dans l'autre sens : là-bas le code était en
avance sur la base, ici la base était en avance sur la branche. Deux histoires
qui avancent séparément, et c'est toujours l'écart qui mord.

**Au passage, une prise sur la pull request elle-même** : Dependabot avait
remplacé le SHA de v1.7.1 par celui de v3.0.0 en laissant le commentaire
`# v1`. Dans un dépôt qui épingle ses actions par SHA, ce commentaire est la
seule chose qu'un humain peut lire — il aurait annoncé une version que
l'épingle ne pointe pas. Vérifier à quel tag correspond réellement un SHA
proposé fait partie de la relecture.

### Next 16 refuse un second `next dev` dans le même répertoire

Détail d'outillage, quinze minutes perdues. Un serveur de développement tournait
déjà, lancé hors session, sur une base inconnue. Le tuer n'était pas à moi de le
décider ; en lancer un second échoue avec « Another next dev server is already
running ».

`next build` puis `next start -p 3001` ne tombe pas sous ce verrou, et teste en
prime le comportement de production — celui où le cache et le rendu statique
peuvent surprendre. C'est devenu la façon de faire par défaut de la session.

## Ce qui a bien marché

### Le sous-agent `revue-securite`, deux fois

Lancé sur la route après le ticket 13, puis sur le lexique après le ticket 14.
**Cinq prises réelles**, dont trois capables de casser le rattachement en
silence, plus deux remarques de forme reprises telles quelles.

Aucune n'était une fuite entre comptes — il a tracé les treize requêtes et leur
filtre une par une pour le dire — et c'est justement ce qui rend le reste
crédible. Un agent qui ne trouve rien et ne dit pas ce qu'il a regardé
n'apprend rien.

Deux conditions à respecter, la seconde apprise au lot M1 : **lui donner un
arbre stable** (tout commité, pas au milieu d'un changement de branche), et lui
donner le contexte de ce qui est *voulu*. Sans savoir que l'écriture
cross-compte est une décision et non un bug, il aurait signalé le rattachement
lui-même et noyé ses vraies trouvailles.

### L'inspecteur MCP en `--strict`

`npx @modelcontextprotocol/inspector --cli <url> --transport http --method
tools/list --strict` ne se contente pas de lister : il signale les schémas que
plusieurs clients lisent mal. Ici, deux champs en `"type": ["string","null"]`,
produits par `z.nullable()`, forme légale que certains clients rejettent ou dont
ils laissent tomber la contrainte. Corrigé en `anyOf` via un helper `ouRien()`,
posé avant d'écrire les outils des tickets suivants.

Une vérification qui coûte une option et qui attrape une classe d'erreurs qu'on
ne verrait, sinon, que chez un client qu'on n'a pas.

### Lire le paquet installé, encore

Troisième lot, troisième fois que ça paie. `mcp-handler` 2.x n'est pas ce que
l'on croit savoir de `mcp-handler` : il dépend de `@modelcontextprotocol/server`
2.x et non de `@modelcontextprotocol/sdk` 1.x, `server.tool()` variadique a
disparu au profit de `registerTool`, `inputSchema` prend un schéma complet et
non une forme brute, et toute la configuration de transport et de route de la
1.x a été retirée. Un exemple trouvé en ligne aurait donné l'ancienne API.

Le `README` et les `.d.ts` du paquet, lus dans `node_modules`, donnent la
réponse en deux minutes. Le détail qui a servi ensuite : le SDK **ne valide pas
la sortie d'un résultat marqué `isError`**, ce qui dispense d'inventer des
champs vides pour satisfaire un schéma qui décrit un succès.

### Piloter Chrome, encore

Trois choses du lot ne se vérifient pas en lisant le code : qu'un jeton en clair
soit irrécupérable après rechargement, qu'une révocation coupe l'appel suivant,
et qu'un item rattaché par le connecteur **s'affiche** vraiment. Les scripts de
`REX-M1.md` ont été réécrits — ils vivent toujours dans le répertoire temporaire
de la session — et ont servi à tout, jusqu'à la capture d'écran du README.

Une addition utile : fabriquer les cookies de session en passant la session à
`createServerClient` de `@supabase/ssr` avec un magasin en mémoire. La
bibliothèque écrit alors elle-même les bons noms et le bon découpage, au lieu de
les deviner.

### Le connecteur, branché pour de vrai

**Fait le 14 septembre 2026**, après la fusion du lot : jeton généré depuis
`/settings` sur l'application déployée, adresse collée en connecteur
personnalisé dans Claude, connexion établie. Claude est même allé chercher une
recette derrière un lien et a rempli la liste tout seul — ce que le cadrage
décrit comme le critère de réussite du projet.

C'est ce qui ferme le dernier critère d'acceptation du ticket 12 — et c'est la
même séance qui a révélé le défaut des mesures de recette, plus haut. **Les
quinze critères d'acceptation du lot sont donc vérifiés**, et le seul qui ait
tenu jusqu'au bout est celui qu'aucun test ne pouvait atteindre.

Un bémol sur le dernier du ticket 15, « quelqu'un qui n'a pas écrit le code
branche le connecteur en moins de cinq minutes » : le porteur n'a pas écrit le
code, mais il a dirigé tout ce qui l'a produit. Ce n'est donc pas la paire
d'yeux neufs que le critère visait, et il reste à confirmer le jour où
quelqu'un d'autre essaiera.

## Questions laissées ouvertes

**Aucune limitation de débit sur la route.** Chaque jeton invalide coûte un
aller-retour Postgres, sans plafond, sur une URL publique. Ce n'est pas un
problème d'isolation — 256 bits ne se devinent pas — c'est un levier de coût et
de saturation. Même famille que le quota d'emails noté au lot M1 : une gêne tant
qu'il n'y a qu'un utilisateur, une faille de disponibilité dès qu'on est visible.

**Le ticket 18 est devenu un prérequis.** `terms_insert_authenticated` ne
vérifie pas que `fr_normalized` vaut `normalize(fr)` : n'importe quel compte
peut réserver la forme normalisée d'un terme courant en y associant ce qu'il
veut, et `terms` n'ayant ni update ni delete, la réparation demande une
migration. Le trou était connu depuis M1. Ce qui a changé, c'est que le
rattachement rétroactif le **propage désormais aux lignes déjà présentes** dans
les listes des autres comptes, au lieu de n'affecter que les ajouts futurs. Le
ticket et son issue ont été mis à jour.

**La capture d'écran côté Claude n'existera pas, et c'est une décision.** Le
ticket 15 en demandait deux ; il n'y en a qu'une, celle de l'écran de Kori.

Tranché le 16 septembre 2026 par le porteur, avec l'argument qui l'emporte :
**l'interface de Claude est susceptible de changer, donc la capture serait
périmée avant la documentation qu'elle illustre** — et une documentation
illustrée fausse est pire qu'une documentation qui décrit, parce qu'on croit
l'image plutôt que le texte.

La règle qui en découle, et qui vaut au-delà de ce cas : **on illustre ce qu'on
maîtrise.** L'écran de Kori, oui — son apparence est dans ce dépôt, et une
capture périmée se voit en relisant le code. L'écran d'un produit tiers, non :
rien ici ne prévient quand il bouge. Le texte de l'étape 2 dit donc ce qu'il
faut chercher — l'endroit où l'on ajoute un serveur MCP distant en collant son
adresse — plutôt que les mots exacts d'un menu.

**Les accents dans `normalize()`.** Inchangée depuis M0 et M1, et toujours plus
chère à chaque terme ajouté. Le ticket 18 la porte aussi.

**Corriger une traduction fausse.** Toujours ouverte, et D8 la nomme maintenant
explicitement : le lexique est borné en forme, pas modéré en contenu. Une
traduction fausse reste possible et ne se répare pas sans migration.

## Ce que M3 demandera

Le ticket 18 d'abord, puisqu'il est devenu un prérequis et non du ménage. Il
porte trois choses à trancher ensemble : la fonction SQL équivalente à
`normalize()`, la question des accents, et l'impossibilité de mentir sur
`fr_normalized`.

Le ticket 17, le groupement par rayon, trouvera le travail déjà fait côté
données : l'énuméré `aisle` se trie dans son ordre de déclaration, qui est celui
du magasin, et `get_list` comme `add_translation` renseignent déjà le rayon.

Le ticket 16, l'écran de lexique, recoupe `list_missing_translations` : les deux
répondent à la même question, l'un pour Claude, l'autre pour l'utilisateur. La
logique de regroupement par forme normalisée est déjà écrite dans
`_outils/lexique.ts` et mérite sans doute de remonter dans `lib/`.

## En attente côté humain

* ~~Brancher le connecteur dans Claude~~ — **fait le 14 septembre 2026**, voir
  plus haut. C'était le dernier critère d'acceptation ouvert du lot.
* ~~Vérifier la migration après fusion~~ — **fait le 16 septembre 2026**, et par
  le comportement, pas par la liste. Les trois contraintes existent sur la base
  hébergée, toutes en `convalidated = false`, ce qui est le `not valid` attendu.
  Une insertion d'un finnois sur deux lignes est refusée en `23514` sur
  `terms_fi_forme` — donc rien n'est écrit, et la contrainte contraint.

  Ce qui reste, sans urgence : les contraintes étant posées en `not valid`,
  elles ne disent rien des 286 lignes déjà présentes. Un `validate constraint` à
  froid le confirmerait un jour ; ces lignes viennent du seed et respectent déjà
  la règle, donc la seule chose qu'il apporterait est une certitude écrite.
* **Fermer les inscriptions**, toujours pas fait, et la condition de déclenchement
  n'a pas changé depuis M1.
