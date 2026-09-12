---
title: "Initialiser l'application Next.js et le déploiement Vercel"
milestone: "M0 Socle"
labels: "type:chore, size:S, area:front"
---
## Contexte

Point de départ du projet. Rien d'autre ne peut avancer tant que le squelette
n'est pas déployé, et il vaut mieux déployer un écran vide le premier jour
qu'une application finie le dernier.

## À faire

* Créer l'app avec `npx create-next-app@latest` : TypeScript, App Router, Tailwind, ESLint
* Nettoyer la page d'accueil générée
* Connecter le repo à Vercel, déploiement automatique sur `main`
* README avec les commandes d'installation et de développement

## Critères d'acceptation

* `npm run dev` sert une page sans erreur en console
* un push sur `main` produit une URL de production qui répond 200
* `npm run build` passe sans avertissement TypeScript
