---
title: "Cocher, supprimer, vider les cochés"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:S, area:front"
---
## Contexte

Sans ces trois gestes, la liste n'est qu'un texte. Ils doivent répondre
instantanément, y compris sur un réseau de magasin médiocre.

## À faire

* Appui sur une ligne : coche ou décoche, la ligne barrée passe en bas de liste
* Suppression d'un item par bouton ou balayage
* Bouton "vider les cochés" avec confirmation légère
* Mise à jour optimiste de l'interface, écriture en base ensuite, retour arrière visible en cas d'échec

## Critères d'acceptation

* l'état persiste après rechargement
* cocher pendant une coupure réseau d'une seconde ne perd rien
* aucun double appel en cas d'appuis rapides successifs
