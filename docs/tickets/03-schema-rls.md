---
title: "Schéma de données et politiques de sécurité"
milestone: "M0 Socle"
labels: "type:feat, size:M, area:db"
---
## Contexte

Le modèle complet est posé d'un coup, y compris les tables que M2 et M3
utiliseront. Migrer une base vide coûte moins cher que migrer une base pleine.

## À faire

Migration SQL versionnée dans `supabase/migrations/`.

Type `aisle` : `produce`, `bakery`, `meat`, `fish`, `dairy`, `pantry`, `frozen`,
`drinks`, `household`, `hygiene`, `other`.

Tables :

* `profiles` : `id` (référence `auth.users`), `created_at`
* `lists` : `id`, `owner_id`, `name`, `created_at`
* `terms` : `id`, `fr` (texte affiché), `fr_normalized` (unique), `fi`, `aisle`, `created_by`, `created_at`
* `list_items` : `id`, `list_id`, `term_id` (nullable), `raw_fr`, `quantity` (texte, nullable), `checked` (bool), `position`, `created_at`
* `mcp_tokens` : `id`, `user_id`, `token_hash`, `prefix`, `label`, `created_at`, `last_used_at`, `revoked_at`

Politiques de sécurité au niveau des lignes, activées sur toutes les tables :

* `lists` et `list_items` : lecture et écriture réservées au propriétaire
* `terms` : lecture par tout utilisateur authentifié, insertion par tout utilisateur authentifié, pas de suppression
* `mcp_tokens` : lecture et écriture réservées au propriétaire

## Critères d'acceptation

* avec deux comptes de test, le compte A n'obtient aucune ligne du compte B
* la contrainte d'unicité sur `fr_normalized` rejette bien un doublon
* la migration s'applique sur une base vide sans intervention manuelle
