---
title: "Consultation hors ligne et écritures différées"
milestone: "M4 Finition mobile"
labels: "type:feat, size:L, area:front"
---
## Contexte

Le réseau mobile dans un magasin en sous-sol est mauvais. Une liste qui ne
s'affiche pas au moment où on en a besoin ne sert à rien.

## À faire

* Cache local de la dernière liste connue, affichée immédiatement au démarrage
* File d'attente des écritures (cocher, ajouter, supprimer) rejouée à la reconnexion
* Indicateur discret d'état hors ligne
* Résolution de conflit simple : la dernière écriture gagne

## Critères d'acceptation

* en mode avion, la liste s'affiche et reste utilisable
* les cases cochées hors ligne sont bien enregistrées une fois le réseau revenu
* aucune double insertion après rejeu de la file
