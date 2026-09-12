---
title: "Authentification par lien magique"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:M, area:auth"
---
## Contexte

Multi-utilisateur dès la v1, donc il faut des comptes. Le lien magique évite de
gérer des mots de passe, des règles de complexité et une procédure d'oubli.

## À faire

* Activer l'authentification par email dans Supabase, désactiver le mot de passe
* Page `/login` : un champ email, un bouton, un message de confirmation
* Route de callback qui échange le code contre une session
* Middleware Next.js qui rafraîchit la session à chaque requête
* Redirection vers `/login` pour toute route protégée sans session
* Bouton de déconnexion

## Critères d'acceptation

* la connexion aboutit depuis le lien reçu par email
* la session survit à un rechargement et à la fermeture de l'onglet
* une route protégée ouverte sans session redirige au lieu d'échouer
* le lien magique fonctionne aussi depuis un déploiement Preview (URLs de redirection autorisées configurées)
