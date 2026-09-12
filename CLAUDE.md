@AGENTS.md

# Kori

Liste de courses bilingue : on saisit en français, la liste affiche le finnois,
et un connecteur Claude (MCP) la remplit à partir d'une recette.

Le cadrage fait autorité et n'est pas recopié ici. `docs/CADRAGE.md` porte le
périmètre, les décisions D1 à D5 et le modèle de données ; `docs/HANDOFF.md`
porte les raisons de ces choix et les options écartées. Les relire avant de
proposer une décision qui les contredit, et me le signaler si c'est le cas.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind 4) déployé sur Vercel, Supabase
pour Postgres et l'authentification, serveur MCP exposé par l'application.

## Commandes

```bash
npm run dev        # serveur de développement
npm run build      # build de production
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Règles non négociables

1. **Aucun secret dans un fichier versionné.** Le repo est public : une clé
   commitée est une clé brûlée, il faut la révoquer, pas réécrire l'historique.
   Ni clé, ni jeton, ni URL de projet Supabase, y compris en exemple ou en
   commentaire. Les variables attendues vivent dans `.env.example`, vides.

2. **La clé de service Supabase ne sort pas du serveur.** Elle contourne toutes
   les politiques RLS. On y accède uniquement par `serverEnv()` dans
   `src/lib/env.ts`, jamais depuis un composant client, jamais derrière un nom
   préfixé `NEXT_PUBLIC_`.

3. **Toute nouvelle table naît avec ses politiques RLS activées**, dans la même
   migration que le `create table`. Jamais de table livrée sans, jamais de
   `disable row level security`.

4. **Toute entrée utilisateur est validée côté serveur avec zod**, y compris les
   arguments des outils MCP. Une validation côté client n'est pas une validation.

## Travail

Un ticket, une branche, une pull request.

Les tickets vivent dans `docs/tickets/`, un fichier par ticket. Ils sont la
source de vérité, les issues GitHub en sont le reflet. Nommer la branche
`<numéro>-<slug>`, par exemple `03-schema-rls`.

Un ticket est fermé quand ses critères d'acceptation sont vérifiés, pas quand le
code compile. Les vérifier un par un et dire lesquels ont été testés comment.

Une décision technique nouvelle s'ajoute à `docs/CADRAGE.md` en `D<n>`, avec sa
raison et les options écartées, dans le même format que D1 à D5.

## Repères

* `src/lib/env.ts` : variables d'environnement validées, frontière client/serveur
* `src/lib/terms.ts` : `normalize()` et `resolveTerm()`, seule normalisation du lexique
* `supabase/migrations/` : schéma et politiques RLS
* `src/app/api/mcp/[token]/` : le connecteur
