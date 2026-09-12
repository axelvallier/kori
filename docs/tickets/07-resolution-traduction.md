---
title: "Résoudre la traduction d'un terme à l'ajout"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:M, area:db"
---
## Contexte

Cœur du produit. Le texte saisi doit retrouver la bonne ligne du lexique malgré
les articles, les pluriels et les majuscules.

## À faire

Fonction `normalize(fr)` dans `lib/terms.ts` :

* passage en minuscules, espaces multiples réduits, espaces de bord retirés
* retrait d'un article ou d'un partitif initial : `le`, `la`, `les`, `un`, `une`, `des`, `du`, `de la`, `de l'`, `d'`
* pluriel simple retiré : `s` ou `x` final, sauf sur une liste courte d'exceptions

Fonction `resolveTerm(fr)` : normalise puis cherche une correspondance exacte
sur `terms.fr_normalized`. Renvoie le terme, ou `null`.

Aucun appel réseau externe, aucun modèle de langue, aucune correspondance
approximative en v1.

## Critères d'acceptation

* `"Des Tomates "`, `"tomates"` et `"tomate"` renvoient le même terme
* un terme absent renvoie `null` sans lever d'exception
* tests unitaires sur au moins vingt cas, dont les pièges connus (`ananas`, `riz`, `oeufs`)
