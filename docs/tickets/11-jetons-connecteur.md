---
title: "Générer et révoquer les jetons de connecteur"
milestone: "M2 Connecteur Claude"
labels: "type:feat, size:M, area:auth"
---
## Contexte

Le connecteur MCP est authentifié par un jeton porté dans l'URL (décision D3 du
cadrage). Il faut pouvoir en créer un, le copier une fois, et le couper.

## À faire

* Page `/settings` : liste des jetons avec préfixe, libellé, date de création, dernière utilisation
* Génération : 32 octets aléatoires en base64url, affichés une seule fois, stockés hachés en SHA-256
* Révocation immédiate, ligne conservée avec `revoked_at` renseigné
* L'URL complète du connecteur est affichée prête à copier

## Critères d'acceptation

* le jeton en clair est impossible à relire après la fermeture de la fenêtre
* un jeton révoqué provoque un 401 au prochain appel, sans délai de cache
* deux jetons peuvent coexister pour un même compte
