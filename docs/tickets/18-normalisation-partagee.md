---
title: "Extraire la normalisation et verrouiller les doublons"
milestone: "M3 Lexique et rayons"
labels: "type:chore, size:S, area:db"
---
## Contexte

Trois entrées écrivent dans le lexique : le seed, l'écran de lexique et le
connecteur. Si leurs règles de normalisation divergent, le lexique se remplit
de doublons invisibles.

## À faire

* Une seule implémentation dans `lib/terms.ts`, importée par les trois chemins
* Fonction équivalente en SQL pour la contrainte d'unicité, ou colonne générée
* Batterie de tests unitaires couvrant articles, pluriels, casse, accents, espaces

## Critères d'acceptation

* impossible de créer deux entrées pour `tomate` et `Tomates`
* les tests passent en intégration continue
* le seed rejoué sur une base déjà remplie n'insère rien
