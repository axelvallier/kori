---
title: "Écran de lexique et traductions manquantes"
milestone: "M3 Lexique et rayons"
labels: "type:feat, size:M, area:front"
---
## Contexte

Compléter une traduction ne doit pas dépendre d'un aller-retour par Claude. Le
raccourci manuel est utile quand on est déjà devant le produit.

## À faire

* Page `/lexicon` : recherche dans le lexique, et en tête la liste des termes en attente de traduction
* Saisie du finnois et du rayon sur une ligne, écriture immédiate
* Même normalisation que le front et le connecteur, via `lib/terms.ts`
* Depuis la liste de courses, une mention "traduction manquante" mène directement à la saisie

## Critères d'acceptation

* compléter une traduction depuis un téléphone prend moins de quinze secondes
* le terme ajouté apparaît aussitôt dans la liste de courses
* la recherche trouve un terme quelle que soit la casse
