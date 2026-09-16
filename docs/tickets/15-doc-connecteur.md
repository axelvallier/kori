---
title: "Documenter le branchement du connecteur"
milestone: "M2 Connecteur Claude"
labels: "type:doc, size:S"
---
## Contexte

Un connecteur que personne ne sait brancher n'existe pas. C'est aussi le
document qui sert de démonstration du projet.

## À faire

* Section du README : générer un jeton, copier l'URL, ajouter le connecteur personnalisé dans les réglages de Claude
* Capture d'écran de l'étape côté Kori. **Pas de capture côté Claude** : décidé
  le 16 septembre 2026, l'interface d'un produit tiers change sans prévenir et
  la capture serait périmée avant le texte qu'elle illustre. On illustre ce
  qu'on maîtrise. Voir `docs/REX-M2.md`.
* Trois prompts d'exemple : coller une recette, demander ce qui manque en traduction, vider les articles déjà achetés
* Mention explicite que le jeton donne accès à la liste et ne doit pas être partagé

## Critères d'acceptation

* quelqu'un qui n'a pas écrit le code branche le connecteur en moins de cinq minutes
* les prompts d'exemple fonctionnent tels quels
