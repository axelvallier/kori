---
title: "Créer le projet Supabase et câbler les clients"
milestone: "M0 Socle"
labels: "type:chore, size:S, area:db"
---
## Contexte

Supabase fournit la base, l'authentification et les politiques de sécurité.
Ce ticket met en place l'accès, pas encore les tables.

## À faire

* Créer le projet Supabase en région européenne (Francfort ou Stockholm)
* Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
* Installer `@supabase/supabase-js` et `@supabase/ssr`
* Deux fabriques de client : `lib/supabase/server.ts` (cookies, contexte serveur) et `lib/supabase/client.ts` (navigateur)
* Reporter les variables dans Vercel, environnements Preview et Production
* `.env.example` versionné, `.env.local` ignoré par git

## Critères d'acceptation

* une page serveur exécute une requête triviale et affiche son résultat
* `SUPABASE_SERVICE_ROLE_KEY` n'apparaît dans aucun fichier importé côté client
* le déploiement Vercel fonctionne avec les mêmes variables
