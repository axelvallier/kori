---
paths:
  - "supabase/**"
---

# Migrations SQL

## Row Level Security

Toute nouvelle table naît avec ses politiques, dans la **même migration** que le
`create table`. Une table livrée sans politique est lisible par n'importe quel
porteur de la clé publiable, qui est publique par conception.

```sql
alter table public.<table> enable row level security;
```

Puis une politique explicite par opération (`select`, `insert`, `update`,
`delete`). `enable row level security` sans aucune politique bloque tout accès
au rôle `authenticated` : c'est sûr, mais ça casse l'application en silence, et
la tentation est alors de désactiver RLS plutôt que d'écrire la politique
manquante.

Interdits, sans exception : `disable row level security`, `alter table ... force
row level security` retiré, une politique `using (true)` sur une table portant
des données d'utilisateur.

## Isolation entre comptes

Les tables rattachées à un compte (`lists`, `list_items`, `mcp_tokens`) filtrent
sur le propriétaire via `auth.uid()`. Pour `list_items`, qui ne porte pas de
colonne propriétaire, remonter à `lists.owner_id` par sous-requête — ne pas
supposer que le filtre applicatif suffira.

`terms` est le lexique global et partagé (décision D2) : lecture et insertion
par tout utilisateur authentifié, aucune suppression. C'est voulu, ce n'est pas
une politique oubliée.

## Écriture des migrations

* Un fichier par migration dans `supabase/migrations/`, jamais modifié après
  avoir été appliqué. Une correction est une nouvelle migration.
* Idempotence là où elle ne coûte rien : `create table if not exists`,
  `drop policy if exists` avant `create policy`.
* Les données de départ du lexique passent par un `insert ... on conflict do
  nothing` sur `fr_normalized`, pour que le seed rejoué n'insère rien.

## Avant de dire que c'est fini

Vérifier l'isolation avec deux comptes de test, pas par lecture du SQL : le
compte A ne doit obtenir aucune ligne du compte B. Le sous-agent
`revue-securite` est là pour relire la migration avant la pull request.
