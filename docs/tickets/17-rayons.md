---
title: "Grouper la liste par rayon dans l'ordre du magasin"
milestone: "M3 Lexique et rayons"
labels: "type:feat, size:M, area:front"
---
## Contexte

Une liste dans l'ordre de saisie fait traverser le magasin six fois. Le rayon
est déjà porté par le lexique, il ne reste qu'à s'en servir.

## À faire

* Groupement des items par rayon, avec en-tête de section portant le nom finnois du rayon et le français en dessous
* Ordre des rayons figé en dur, calé sur un S-market type : fruits et légumes, boulangerie, produits laitiers, viande, poisson, épicerie sèche, surgelés, boissons, entretien, hygiène, autre
* Les items sans rayon tombent dans "autre", en fin de liste
* Les items cochés sortent de leur section et passent tout en bas

## Critères d'acceptation

* un caddie de quinze articles se parcourt sans revenir sur ses pas
* un rayon sans article n'affiche pas d'en-tête vide
