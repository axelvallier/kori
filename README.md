# Kori

Liste de courses bilingue français / finnois, avec un connecteur Claude qui
remplit la liste à partir d'une recette.

Tu saisis en français, la liste affiche le finnois. En rayon, tu ne lis que le
finnois.

## État

Socle Next.js en place, lot M0 en cours.

* `docs/HANDOFF.md` : la mémoire du projet, contexte du cadrage et raisons des choix
* `docs/CADRAGE.md` : problème, périmètre, décisions techniques, modèle de données
* `docs/BACKLOG.md` : les vingt et un tickets, par lot
* `docs/tickets/` : un fichier par ticket, source de vérité des issues GitHub

## Stack

Next.js (App Router) déployé sur Vercel, Supabase pour Postgres et
l'authentification, serveur MCP exposé par l'application elle-même.

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de production
npm run lint       # ESLint
npm run typecheck  # types des routes + tsc --noEmit
```

## Base de données en local

La base tourne dans des conteneurs. Sur macOS, Docker suppose une machine
virtuelle Linux : Colima en fournit une sans interface graphique.

```bash
brew install colima docker supabase/tap/supabase
colima start --cpu 4 --memory 5 --disk 20

supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor,postgres-meta
npm run db:reset   # rejoue toutes les migrations sur une base vide
npm run db:test    # vérifie l'isolation entre comptes et les politiques RLS
```

Les services exclus ne servent pas encore et la pile complète ne tient pas dans
5 Go de RAM. `colima stop` rend la mémoire, `colima start` la reprend sans
retélécharger.

`supabase/tests/isolation.sql` s'exécute dans une transaction annulée à la fin :
il ne laisse aucune donnée derrière lui, y compris si on le colle dans l'éditeur
SQL d'une base réelle.

## Hygiène des secrets

Le repo est public : aucune clé ne doit y entrer. Un hook de pré-commit lance
`gitleaks` sur les fichiers indexés. Le chemin des hooks n'étant pas cloné avec
le repo, il faut l'activer une fois après un clone :

```bash
git config core.hooksPath .githooks
brew install gitleaks   # sinon le hook avertit et laisse passer
```

Les variables d'environnement attendues sont listées dans `.env.example`, à
copier en `.env.local`. `src/lib/env.ts` les valide au démarrage et interdit la
lecture de la clé de service Supabase depuis le navigateur.

## Peupler les issues GitHub

```bash
gh auth login
node scripts/bootstrap-github.mjs axelvallier/kori
```

Le script crée les labels, les milestones et les issues à partir de
`docs/tickets/`. Il peut être relancé sans créer de doublon.
