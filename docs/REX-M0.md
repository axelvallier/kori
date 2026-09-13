# Retour d'expérience, lot M0

Session du 12 au 13 septembre 2026. Axel Vallier, avec Claude Code.

Ce document complète `HANDOFF.md`, qui porte la mémoire du cadrage. Celui-ci
porte la mémoire de la **réalisation** : les pièges rencontrés, ce qui a marché,
et ce qu'il faut savoir avant d'attaquer M1. Il ne raconte pas ce que l'historique
git raconte déjà.

Les décisions techniques nouvelles ne vont pas ici mais dans `CADRAGE.md`, en
`D<n>`. Une seule est née pendant M0 : **D6**, l'adoption des clés Supabase au
nouveau format.

## État à la fin de M0

| Ticket | Issue | |
|---|---|---|
| 01 Squelette Next.js et Vercel | #6 | fermé |
| 02 Projet Supabase et clients | #7 | fermé |
| 03 Schéma et politiques RLS | #8 | fermé |
| 04 Lexique initial | #9 | fermé |

Production sur `https://kori-6p7o.vercel.app`. Base distante migrée et peuplée
de 286 termes. Dix-sept issues restantes.

## Les pièges, par ordre de coût

### Un test qui passe pour la mauvaise raison

Deux fois dans la même session.

**`head: true` fait disparaître les erreurs.** Une requête HTTP HEAD vers une
table absente renvoie un 404 au corps vide, et `postgrest-js` convertit
exactement ce cas en 204 sans erreur — c'est une rustine de leur
[issue 295](https://github.com/supabase/postgrest-js/issues/295). La page
d'accueil annonçait « Lexique : 0 terme » pour une table qui n'existait pas, et
le critère d'acceptation serait passé au vert sur une connexion non prouvée.
**Partout où l'on compte des lignes, préférer un GET.**

**Le test d'isolation comptait les termes en dur.** Il passait sur base vide et
échouait dès que le seed peuplait le lexique. Un test doit être juste sur une
base réaliste, pas seulement sur celle du développeur.

D'où la méthode retenue : **saboter chaque protection une par une et vérifier
que le test la détecte.** Onze sabotages ont été rejoués contre
`supabase/tests/isolation.sql`. C'est ce qui donne le droit de dire qu'un
critère est vérifié.

### Le local ment sur l'état d'un clone frais

`tsc --noEmit` passait en local grâce à un `.next/` résiduel, et échouait en
intégration continue sur `LayoutProps`, un type que Next **génère**. Corrigé par
`next typegen && tsc --noEmit`, qui rend l'étape autonome.

Règle générale : avant de déclarer une commande bonne, la rejouer après
`rm -rf .next next-env.d.ts`.

### Dependabot casse ce qui doit bouger ensemble

`react` et `react-dom` bumpés dans deux pull requests séparées, alors qu'une
dépendance de pair les lie. Chacune prise seule produit une erreur ERESOLVE et
fait échouer `npm install`, y compris sur Vercel. Les groupes sont maintenant
posés dans `.github/dependabot.yml` : `react`/`react-dom`/leurs types, et
`next`/`eslint-config-next`.

**À surveiller** : tout couple futur lié par une dépendance de pair.

### Le numéro d'issue n'est pas le numéro de ticket

Issues et pull requests partagent un seul compteur sur GitHub. Les cinq
premières PR de Dependabot ont mangé les numéros 1 à 5, décalant les vingt et
une issues sur 6 à 26. La commande `/ticket` résout donc par le **fichier** et
retrouve l'issue par son titre. Toujours partir de `docs/tickets/`.

### L'API GraphQL de GitHub tombe

`gh pr close` et `gh pr create` ont échoué plusieurs fois sur des erreurs
serveur GraphQL. `gh api` passe par REST et fonctionne :

```bash
gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f state=closed
echo '{"title":"…","head":"…","base":"main","body":"…"}' | gh api -X POST repos/<owner>/<repo>/pulls --input -
```

`HANDOFF.md` le notait déjà pour le cadrage ; la remarque tient toujours.

### Ne pas supprimer une branche avant d'avoir confirmé la fusion

Une pull request empilée a été fermée par la suppression prématurée de sa
branche, après que la fusion en rebase de sa base eut réécrit les SHA et créé
un conflit. Rebaser, repousser, rouvrir — quinze minutes perdues. **Vérifier le
message de fusion avant de supprimer quoi que ce soit.**

### Ce que le fournisseur change sous vos pieds

Supabase a remplacé les clés `anon`/`service_role`, qui étaient des JWT, par
`sb_publishable_…` et `sb_secret_…`. Les anciennes sont dépréciées d'ici fin
2026. Le cadrage nommait les anciennes ; D6 acte le changement. Le panneau
**Connect** du tableau de bord donne les variables sans le préfixe
`NEXT_PUBLIC_`, qu'il faut ajouter soi-même sur les deux variables publiques.

## Ce qui a bien marché

**Vérifier les termes contre le vrai magasin.** La décision D2 se démontre mot
pour mot : `ranskankerma` et non `kerma` pour crème fraîche, `rahka` et non
`valkoinen juusto` pour fromage blanc, `broileri` et non `kana` pour poulet.
Un traducteur générique se serait trompé trois fois sur quatre.

**Lire les types du paquet installé plutôt qu'un exemple de blog.** C'est en
lisant `@supabase/ssr` qu'on a vu que `setAll` prend désormais un second
argument, des en-têtes de cache que les réponses posant un cookie de session
doivent porter — sans quoi un CDN peut servir le jeton d'un utilisateur à un
autre. Ce sera central pour le middleware du ticket 05.

**Les règles à portée de chemin.** `.claude/rules/` ne se charge que quand c'est
utile, et la règle sur les migrations a effectivement guidé l'écriture du
schéma.

## L'environnement local

Machine : MacBook M1, 8 Go de RAM, disque serré. Docker n'existe pas nativement
sur macOS — les conteneurs sont une fonctionnalité du noyau Linux — donc une
machine virtuelle est obligatoire. Colima la fournit sans interface graphique ni
licence, là où Docker Desktop demande des clics.

```bash
colima start --cpu 4 --memory 5 --disk 20
supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor,postgres-meta
```

Dix services sont exclus : la pile complète ne tient pas dans 4,8 Go. On garde
Postgres, **GoTrue** (qui crée `auth.users` et `auth.uid()`, indispensables aux
politiques RLS), Kong et PostgREST. `colima stop` rend la mémoire.

Commandes utiles : `npm run db:reset`, `npm run db:test`,
`npm run seed:terms:local`.

## Questions laissées ouvertes

**Le rayon de `tofu`, `seitan` et `härkis`.** Classés dans `meat` en suivant la
catégorie de tête de K-ruoka, « Liha ja kasviproteiinit ». Mais leur catalogue
les range aussi sous les fromages, et en magasin ils sont souvent au frais
végétarien. À trancher après quelques courses réelles.

**Les accents dans `normalize()`.** La fonction ne les retire pas : `pêche` et
`peche` produisent deux formes distinctes. Le ticket 18 demande des tests sur
les accents, donc la question se posera. **Attention au coût** : `terms` n'a
aucune politique d'update, donc changer la règle imposera une migration pour
réécrire `fr_normalized` sur toutes les lignes. Décider tôt.

**Corriger une traduction fausse.** `terms` n'a ni `update` ni `delete`, par
choix : le lexique s'enrichit, il ne se réécrit pas. Le jour où une traduction
sera erronée, il faudra une décision explicite — probablement au ticket 14.

**Le sous-agent `revue-securite`.** Écrit et versionné, jamais exécuté : il
n'était pas enregistré comme type d'agent dans cette session. À lancer depuis
une session interactive sur la migration et, surtout, sur la route du connecteur.

## Ce que M1 demandera

Le ticket 05, l'authentification par lien magique, ouvre le lot et **exige un
réglage manuel** dans Supabase, sous **Authentication → URL Configuration** :

* **Site URL** : `https://kori-6p7o.vercel.app`
* **Redirect URLs** : `http://localhost:3000/**` et `https://kori-6p7o-*.vercel.app/**`

Sans la seconde, le dernier critère du ticket — « le lien magique fonctionne
aussi depuis un déploiement Preview » — ne pourra pas être vérifié.

**À savoir avant de s'inquiéter** : la page d'accueil affiche « Lexique : 0
termes » en production alors que la base en contient 286. Ce n'est pas un bug,
c'est RLS. La politique de lecture de `terms` est `to authenticated`, la page
interroge sans session, donc elle voit zéro. Le compte deviendra juste dès qu'il
y aura une session, et le ticket 08 remplace cette page de toute façon.

## Deux choses en attente côté humain

* Activer le **signalement privé de failles** dans Settings → Security du dépôt,
  vers lequel pointe `SECURITY.md`. Il est inactif par défaut.
* Trois pull requests Dependabot ouvertes, vertes, à regarder : le groupe React,
  les types de Node, et ESLint 9 vers 10 qui est un saut majeur.
