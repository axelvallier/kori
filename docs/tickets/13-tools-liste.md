---
title: "Outils MCP de manipulation de la liste"
milestone: "M2 Connecteur Claude"
labels: "type:feat, size:M, area:mcp"
---
## Contexte

La fonctionnalité qui motive le projet : coller une recette dans Claude et
retrouver les ingrédients dans la liste.

## À faire

Outils exposés :

* `get_list()` : items avec identifiant, français, finnois, quantité, rayon, état coché
* `add_items(items)` : chaque item porte `fr` et `quantity` optionnelle, passe par la même normalisation que le front, renvoie pour chacun le finnois trouvé ou `missing_translation: true`
* `check_items(ids)` et `uncheck_items(ids)`
* `remove_items(ids)`
* `clear_checked()`

Les descriptions des outils doivent indiquer à Claude d'envoyer des ingrédients
au singulier et sans préparation (`oignon`, pas `oignons émincés`).

## Critères d'acceptation

* "ajoute de quoi faire une carbonara pour quatre" remplit la liste en un seul appel
* la réponse de `add_items` énumère explicitement les termes non traduits
* ajouter deux fois le même produit ne crée pas deux lignes, la quantité est mise à jour
