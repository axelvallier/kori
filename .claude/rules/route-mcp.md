---
paths:
  - "src/app/api/mcp/**"
---

# Route du connecteur MCP

Cette route est la seule surface de l'application accessible sans session
Supabase : elle s'authentifie par un jeton porté dans l'URL (décision D3) et
travaille avec la clé de service, qui contourne toutes les politiques RLS. Le
filet de sécurité de la base ne joue donc pas ici. Le filtrage est à la charge
de ce code, à chaque requête.

## Vérification du jeton

Le jeton est comparé **haché**, jamais en clair. Rejeter si la ligne est absente
ou si `revoked_at` n'est pas nul. Résoudre le jeton **avant** d'exécuter le
moindre outil, et n'exécuter aucun outil sur un contexte partiel.

## Le message d'erreur ne doit rien distinguer

Jeton inconnu, jeton révoqué, jeton mal formé : **la même réponse 401, le même
corps, le même délai**. Distinguer les cas transforme la route en oracle qui
confirme qu'un jeton a existé. Le détail va dans les logs serveur, pas dans la
réponse.

Ne pas renvoyer non plus le nombre de tentatives restantes, l'identifiant du
compte, ni la date de révocation.

## Filtrage explicite, à chaque requête

Chaque requête porte son filtre sur le compte, écrit sur place :

```ts
.eq("owner_id", ctx.userId)     // ou .eq("list_id", ctx.listId)
```

Ne jamais s'en remettre à un filtre appliqué plus haut dans la chaîne, à un
`ctx` supposé déjà restreint, ou à un identifiant reçu dans les arguments de
l'outil. Un `list_id` venant du client est une donnée à vérifier, pas une
autorisation : confirmer qu'il appartient bien à `ctx.userId` avant de s'en
servir.

## Arguments des outils

Tout argument d'outil est une entrée utilisateur : schéma zod, validation côté
serveur, aucune valeur reprise telle quelle dans une requête. Ce que Claude
envoie n'est pas plus digne de confiance qu'un formulaire.

## Avant de dire que c'est fini

L'isolation se prouve avec deux comptes de test et deux jetons, pas par lecture
du code. Faire relire la route par le sous-agent `revue-securite`.
