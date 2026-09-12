---
title: "Écran de liste avec affichage bilingue"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:M, area:front"
---
## Contexte

L'écran unique de l'application. Il est lu debout, d'une main, dans un magasin
éclairé au néon.

## À faire

* Champ de saisie en haut, ajout à la validation, le champ se vide et garde le focus
* Une ligne par item : finnois en gros, français en dessous en plus petit et plus clair
* Item sans traduction : mention "traduction manquante" en gris à la place du finnois, le français reste lisible
* Ordre d'ajout conservé
* État vide explicite avec une phrase d'amorce

## Critères d'acceptation

* l'ajout se fait sans rechargement de page
* dix items s'affichent sans défilement sur un écran de téléphone courant
* le finnois reste lisible à bout de bras
