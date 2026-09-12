---
title: "Recevoir un partage depuis une autre application Android"
milestone: "M4 Finition mobile"
labels: "type:feat, size:L, area:front"
---
## Contexte

Sur Android, une application web installée peut s'inscrire dans la feuille de
partage du système au même titre qu'une application native, grâce au champ
`share_target` du manifeste. Concrètement : tu tombes sur une recette dans ton
navigateur ou dans une autre application, tu appuies sur partager, et Kori
apparaît dans la liste des destinations.

C'est la fonctionnalité qui manque structurellement sur iOS et que l'on obtient
gratuitement ici. Elle ne remplace pas le connecteur Claude, elle le complète.

## Limite à assumer dès la conception

Extraire proprement les ingrédients d'une recette rédigée en paragraphes est un
travail de compréhension, pas de plomberie, et la décision D2 du cadrage interdit
tout appel payant à un modèle de langue. Ce ticket livre donc un tuyau, pas une
intelligence :

* le texte partagé arrive dans une page de réception, jamais directement dans la
  liste ;
* un analyseur à base de motifs propose un découpage ligne par ligne, en
  réutilisant `parseEntry` du ticket 10 pour séparer quantité et produit ;
* l'utilisateur coche ce qu'il garde avant d'ajouter, et corrige ce que
  l'analyseur a mal découpé.

Le chemin réellement intelligent reste celui de la recette donnée à Claude, qui
remplit la liste par le connecteur. Ne pas essayer de le reproduire ici.

## À faire

* Champ `share_target` dans le manifeste, en POST avec `multipart/form-data`,
  acceptant titre, texte et URL
* Interception de la requête dans le service worker, puis redirection vers la
  page de réception
* Page de réception : texte découpé en propositions, cases à cocher, édition
  en ligne, bouton d'ajout à la liste
* Validation systématique du contenu reçu côté serveur, le texte partagé est une
  entrée non fiable comme une autre
* Cas dégradés : partage vide, texte très long tronqué proprement, URL seule sans
  texte

## Critères d'acceptation

* Kori apparaît dans la feuille de partage Android après installation
* partager une liste d'ingrédients déjà formatée produit des propositions
  correctes sans intervention
* partager une recette rédigée en paragraphes ne produit jamais d'ajout aberrant
  dans la liste, au pire une page de réception peu utile
* aucun texte partagé n'atteint la base sans validation
