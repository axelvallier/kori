---
title: "Outils MCP d'enrichissement du lexique"
milestone: "M2 Connecteur Claude"
labels: "type:feat, size:M, area:mcp"
---
## Contexte

Décision D2 du cadrage : l'application ne paie aucune traduction, c'est Claude
qui complète le lexique quand un terme manque. Ce ticket ferme la boucle.

## À faire

* `list_missing_translations()` : termes en attente dans les listes du compte
* `add_translation(fr, fi, aisle)` : écrit dans `terms` puis rattache rétroactivement tous les `list_items` dont le texte normalisé correspond, y compris ceux des autres comptes
* Un terme déjà présent n'est jamais écrasé en silence, l'outil renvoie l'entrée existante et le signale
* Description d'outil précisant d'utiliser le nom de produit employé en magasin, pas la traduction littérale

## Critères d'acceptation

* après `add_translation`, l'item concerné affiche le finnois sans action de l'utilisateur
* deux appels concurrents sur le même terme n'aboutissent pas à deux lignes
* le rattachement rétroactif est vérifié sur un item créé avant la traduction
