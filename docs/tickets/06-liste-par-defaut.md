---
title: "Provisionner le profil et la liste par défaut"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:S, area:db"
---
## Contexte

Un compte fraîchement créé n'a ni profil ni liste. Il faut les créer sans
exposer cet état intermédiaire à l'utilisateur.

## À faire

* Déclencheur SQL sur `auth.users` qui crée le `profiles` correspondant
* Création d'une liste nommée "Ostoslista" à la suite du profil
* Garde contre le doublon si le déclencheur est rejoué

## Critères d'acceptation

* un compte neuf arrive directement sur une liste vide, sans écran d'erreur ni de chargement infini
* recharger la page ne crée pas de seconde liste
* supprimer un compte de test nettoie ses lignes (suppression en cascade)
