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

Si la règle de normalisation doit changer, elle change dans `terms.ts`, et la
contrainte SQL correspondante change dans la même pull request.

## La base fait foi

L'unicité est portée par la contrainte sur `terms.fr_normalized`, pas par une
vérification applicative préalable. Un `select` suivi d'un `insert` laisse une
fenêtre entre les deux : écrire l'insertion pour qu'elle tolère le conflit
plutôt que pour l'éviter.

La fonction SQL utilisée par la contrainte doit rester équivalente à
`normalize()`. Toute divergence est un bug, même si les tests TypeScript passent.

## Tests

Toute évolution de `normalize()` s'accompagne de cas de test. Les pièges connus,
à garder verts : `ananas`, `riz` et `oeufs`, où le retrait naïf du pluriel donne
un faux résultat. Articles, partitifs, casse, accents et espaces multiples sont
couverts.
