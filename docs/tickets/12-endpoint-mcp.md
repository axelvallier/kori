---
title: "Endpoint MCP distant"
milestone: "M2 Connecteur Claude"
labels: "type:feat, size:L, area:mcp"
---
## Contexte

Le serveur que Claude appelle. Ticket le plus risqué du projet, à attaquer tôt
et à valider avec l'inspecteur avant d'écrire le moindre outil métier.

## À faire

* Route `app/api/mcp/[token]/route.ts` avec `mcp-handler` en transport Streamable HTTP
* Résolution du jeton : hachage, recherche en base, rejet si absent ou révoqué, mise à jour de `last_used_at`
* Contexte de requête portant `user_id` et `list_id`, passé à chaque outil
* Accès base via la clé de service, avec filtrage explicite sur `user_id` dans toutes les requêtes
* Un outil `ping` pour valider la chaîne de bout en bout

## Critères d'acceptation

* `npx @modelcontextprotocol/inspector` liste les outils et exécute `ping`
* un jeton inconnu ou révoqué renvoie 401 sans fuite d'information
* aucune requête d'outil ne peut atteindre les données d'un autre compte, vérifié avec deux comptes de test
* le connecteur s'ajoute et se connecte réellement dans Claude
