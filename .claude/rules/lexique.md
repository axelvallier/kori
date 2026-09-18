---
paths:
  - "src/lib/terms.ts"
  - "src/**/*lexique*"
  - "src/**/*term*"
  - "supabase/**/*term*"
  - "scripts/**/*lexique*"
---

# Lexique et normalisation

## Une seule implémentation

`normalize()` et `resolveTerm()` vivent dans `src/lib/terms.ts` et nulle part
ailleurs. Trois chemins écrivent dans le lexique — le seed, l'écran de lexique
et le connecteur MCP — et ils importent tous la même fonction.

Ne jamais écrire une normalisation locale, même d'une ligne, même « juste un
`toLowerCase()` » ou un `trim()` avant la comparaison. Deux règles qui divergent
d'un caractère remplissent le lexique de doublons invisibles : `tomate` et
`Tomates` deviennent deux entrées, et l'utilisateur voit une traduction
manquante sur un terme déjà traduit.

Si la règle de normalisation doit changer, elle change dans `terms.ts` **et**
dans `public.normalize_fr` par une nouvelle migration, dans la même pull
request, puis `npm run db:test:normalisation` doit passer sur la base locale.

**Une colonne générée ne se recalcule pas quand sa fonction change** : la
valeur est figée à l'insertion. Une migration qui modifie `normalize_fr` doit
donc aussi réécrire les lignes existantes — `alter column fr_normalized drop
expression` puis recréation de la colonne générée (ou `set expression as`),
précédée du même contrôle de collisions que la migration du ticket 18. Sinon
les lignes anciennes gardent une forme que plus personne ne cherche, et
l'unicité laisse entrer un doublon.

## La base fait foi

L'unicité est portée par la contrainte sur `terms.fr_normalized`, pas par une
vérification applicative préalable. Un `select` suivi d'un `insert` laisse une
fenêtre entre les deux : écrire l'insertion pour qu'elle tolère le conflit
plutôt que pour l'éviter.

`fr_normalized` est une **colonne générée** par `public.normalize_fr(fr)`
(ticket 18, décision D9). Ne jamais l'envoyer dans un `insert` : Postgres
refuse une valeur fournie, même juste. La forme calculée en TypeScript sert à
**chercher** (`in`, `eq`), jamais à écrire.

`normalize_fr` doit rester équivalente à `normalize()`, étape par étape. Toute
divergence est un bug, même si les tests TypeScript passent — c'est
`scripts/verifier-normalisation.mts` qui le vérifie, sur les cas de
`terms.cas.ts` et sur tout le lexique.

## Tests

Toute évolution de `normalize()` s'accompagne de cas dans `src/lib/terms.cas.ts`,
qui servent aux deux côtés. Les pièges connus, à garder verts : `ananas`, `riz`,
`oeufs` et `maïs`, où le retrait naïf du pluriel ou de l'accent donne un faux
résultat. Articles, partitifs, casse, accents et espaces multiples sont
couverts.
