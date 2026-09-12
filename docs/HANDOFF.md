# Handoff de la session de cadrage

Ce document existe pour qu'une session Claude Code démarrant dans ce repo
dispose de tout le contexte produit pendant le cadrage, sans avoir à le
redemander. Il est la mémoire du projet, `CLAUDE.md` en est le mode d'emploi.

Date du cadrage : 12 septembre 2026. Auteur : Axel Vallier, avec Claude.

## Le problème d'origine, dans les mots du porteur du projet

Il vit en Finlande, ne parle pas finnois, et galère à faire ses courses. Il doit
sortir son téléphone et utiliser un traducteur en permanence devant les rayons,
ce qui est pénible. Sa solution : une application de liste de courses à affichage
bilingue, où l'utilisateur saisit en français et où le finnois s'affiche
automatiquement à côté.

Deux contraintes posées dès le départ :

1. Le périmètre se limite au sens français vers finnois. Le reste viendra plus tard.
2. La fonctionnalité prioritaire est un connecteur Claude, pour donner une recette
   à Claude et voir la liste se remplir toute seule.

Le projet est traité comme un vrai projet, organisé en tickets, avec la stack la
plus simple possible. Le porteur du projet est un jeune diplômé de l'Institut
d'optique, profil hybride ingénieur et produit, junior en développement.

## Décisions prises et raisons

Les quatre décisions techniques D1 à D4 sont documentées dans `CADRAGE.md` et ne
sont pas répétées ici. Ce qui suit est le raisonnement qui y a mené, y compris
les options écartées, parce que c'est ce qui se perd le plus vite.

### Le connecteur impose un backend

Un connecteur Claude est un serveur MCP distant : Claude appelle une API que
l'application expose. Une application purement locale, sans serveur, ne peut donc
pas offrir cette fonctionnalité. Par ailleurs la liste doit être consultable sur
le téléphone au magasin alors qu'elle se prépare sur l'ordinateur à la maison.
Les deux contraintes pointent vers la même conclusion : il faut un backend et une
base de données. C'est la première chose qui a été tranchée, et tout le reste en
découle.

### Le tracker de tickets

Trois options ont été considérées : Notion, GitHub Issues, ou un simple fichier
markdown. GitHub Issues a été retenu pour que les tickets vivent à côté du code.
Conséquence : les tickets sont versionnés dans `docs/tickets/`, un fichier par
ticket, et poussés vers GitHub par `scripts/bootstrap-github.mjs`. Le fichier
reste la source de vérité, l'issue en est le reflet.

### La traduction, et pourquoi il n'y a pas d'appel payant

Trois options étaient sur la table : un lexique maison avec secours par modèle de
langue, une API de traduction type DeepL, ou un appel à un modèle à chaque saisie.

L'API de traduction a été écartée pour une raison de qualité : un traducteur
générique se trompe régulièrement sur les produits alimentaires, ne connaît pas
les formats et marques finlandais, et n'a aucune notion de rayon de magasin.

Le porteur du projet a ensuite ajouté une contrainte qui a amélioré le design :
il ne veut rien payer. Plutôt que d'accepter un secours payant, la v1 assume
qu'un terme inconnu produit simplement la mention "traduction manquante" dans la
liste, sans rien bloquer. C'est le connecteur Claude qui comble le trou, via un
outil `add_translation`. Claude devient donc l'éditeur du lexique, et
l'application s'améliore à l'usage pour un coût nul.

Le lexique est global et partagé entre comptes. Une traduction ajoutée par un
utilisateur profite à tous les suivants.

### Le multi-utilisateur, et son coût

Le multi-utilisateur dès la v1 a été choisi en connaissance de cause : il double
à peu près le travail sur le premier lot par rapport à une version mono-compte
avec un simple jeton dans l'URL. Sa conséquence la plus lourde n'est pas l'écran
de connexion mais l'authentification du connecteur MCP, traitée par la décision
D3 avec un jeton personnel porté dans l'URL plutôt qu'un flux OAuth complet.

### Le sens de lecture

Point de conception noté pendant la discussion : on saisit en français mais on
lit en finnois. En rayon, le mot utile est le finnois. L'affichage inverse donc
le sens de saisie, finnois en grand et français en sous-titre.

### La cible est Android, ce qui clôt la question de l'application native

Question posée en fin de cadrage : quelle complexité pour faire une vraie
application plutôt qu'une application web. La réponse tient au fait que le
porteur du projet est sur Android.

Sur Android, Chrome installe une application web sous forme de WebAPK, un paquet
signé qui la place dans le tiroir d'applications, le sélecteur de tâches et les
paramètres système. Elle peut de plus s'inscrire dans la feuille de partage du
système via `share_target`. Les deux arguments qui plaideraient pour du natif sur
iOS, l'intégration système et la réception d'un partage, tombent donc.

Les autres chemins ont été chiffrés et écartés. Capacitor coûterait deux à quatre
jours mais se heurte à la règle 4.2 d'Apple, qui rejette une application web
reconditionnée sans apport natif. React Native demanderait de réécrire toute la
couche d'affichage, deux à trois semaines au niveau du porteur du projet, et
doublerait la maintenance. Dans les deux cas le vrai coût n'est pas les 99
dollars annuels d'Apple ou les 25 dollars de Google, c'est le passage par une
revue de un à trois jours à chaque correctif, contre trente secondes aujourd'hui.

Point important : le backend ne bouge dans aucun de ces scénarios. Supabase, le
lexique et la route MCP se réutilisent tels quels, et la fonctionnalité jugée
prioritaire, le connecteur Claude, est totalement indépendante du choix de
client. L'architecture ne ferme donc aucune porte, ce qui est la seule chose qui
comptait au moment de trancher.

Voir la décision D5 du cadrage.

## État des livrables au moment du handoff

* `docs/CADRAGE.md` : périmètre, décisions, modèle de données, lots. Terminé.
* `docs/BACKLOG.md` : vue d'ensemble des vingt et un tickets par lot. Terminé.
* `docs/tickets/*.md` : vingt et un tickets détaillés avec critères d'acceptation. Terminé.
* `scripts/bootstrap-github.mjs` : crée labels, milestones et issues depuis `docs/tickets/`. Écrit, jamais exécuté.
* Code applicatif : rien. Pas une ligne.
* Repo GitHub : créé manuellement en public par le porteur du projet.
* Projet Supabase, projet Vercel : à créer.

## Ce qui a bloqué, pour éviter de le refaire

Le cadrage a été mené depuis une session Claude en environnement cloud. Cette
session ne pouvait pas créer le repo GitHub, pour deux raisons cumulées. D'abord
un garde-fou du mode automatique qui refuse les écritures vers des services
externes sans validation humaine. Ensuite, et surtout, une limitation structurelle
du proxy : ces sessions sont liées à une liste de repos configurés au démarrage,
et la création d'un repo est hors de ce périmètre. À noter aussi que
`gh repo create` passe par l'API GraphQL de GitHub, coupée dans ces sessions au
profit de REST. Le travail a donc été transféré vers Claude Code en local, ce
document étant le véhicule du transfert.

## Ordre d'attaque recommandé

Les lots M0 à M4 se font dans l'ordre, avec une exception : le ticket 12, qui
implémente l'endpoint MCP, est la pièce la plus risquée du projet. Il faut le
faire répondre `ping` dès le premier jour, avant d'écrire le moindre outil
métier, pour découvrir tôt un éventuel problème de transport plutôt que le
dimanche soir. Le reste du lot M2 attend que M1 soit utilisable.

Le week-end vise M0 à M2. M3 et M4 suivent.

## Conventions de travail attendues

Un ticket, une branche, une pull request. Le ticket est fermé quand ses critères
d'acceptation sont vérifiés, pas quand le code compile. Les décisions techniques
nouvelles s'ajoutent à `CADRAGE.md` sous forme de décision numérotée, avec la
raison et les options écartées, dans le même format que D1 à D4.
