---
title: "Quantités saisies dans la même ligne"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:S, area:front"
---
## Contexte

Personne ne remplit deux champs pour ajouter cinq cents grammes de farine.
La quantité doit se saisir dans la même phrase que le produit.

## À faire

* Analyseur `parseEntry(text)` qui sépare quantité et produit
* Formes acceptées : `2 tomates`, `500 g de farine`, `1 paquet de pâtes`, `farine`
* La quantité est stockée en texte libre, aucune conversion d'unité
* Affichage de la quantité à droite de la ligne

## Critères d'acceptation

* `500g de farine` donne quantité `500 g` et produit `farine`
* `2 tomates` donne quantité `2` et produit `tomate` après normalisation
* un texte sans quantité laisse le champ vide, pas `null` affiché
