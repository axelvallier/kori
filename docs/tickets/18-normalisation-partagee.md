---
title: "Extraire la normalisation et verrouiller les doublons"
milestone: "M3 Lexique et rayons"
labels: "type:chore, size:S, area:db"
---
## Contexte

Trois entrées écrivent dans le lexique : le seed, l'écran de lexique et le
connecteur. Si leurs règles de normalisation divergent, le lexique se remplit
de doublons invisibles.

**Remonté du lot M2, et ça change la priorité de ce ticket.** La politique
`terms_insert_authenticated` vérifie `created_by = auth.uid()` et rien d'autre :
elle ne vérifie **pas** que `fr_normalized` vaut `normalize(fr)`. N'importe quel
compte peut donc réserver la forme normalisée d'un terme courant — insérer
`fr = 'zzz', fr_normalized = 'lait', fi = <ce qu'il veut>` — et comme `terms`
n'a ni update ni delete, plus personne ne peut ajouter le vrai « lait » et la
réparation demande une migration.

Le ticket 14 en a augmenté la portée : `add_translation` rattache désormais
rétroactivement les lignes **déjà présentes dans les listes de tous les
comptes**, donc une entrée squattée se propage à des listes existantes au lieu
de n'affecter que les ajouts futurs. Voir D8 dans `docs/CADRAGE.md`, et la
relecture de sécurité de la PR du ticket 14.

## À faire

* Une seule implémentation dans `lib/terms.ts`, importée par les trois chemins
* Fonction équivalente en SQL pour la contrainte d'unicité, ou colonne générée
* **`fr_normalized` ne doit plus pouvoir mentir** : colonne générée à partir de
  `fr`, ou contrainte `check (fr_normalized = public.normalize_fr(fr))`. Une
  colonne générée est préférable — elle retire l'argument de la requête au lieu
  de le vérifier.
* Trancher la question des accents, ouverte depuis M0 : `crème fraîche` et
  `creme fraiche` sont deux formes distinctes, et la seconde ne trouve rien
* Batterie de tests unitaires couvrant articles, pluriels, casse, accents, espaces

## Critères d'acceptation

* impossible de créer deux entrées pour `tomate` et `Tomates`
* **une insertion directe par la Data API avec un `fr_normalized` qui ne
  correspond pas à `fr` est refusée**, vérifié avec la clé publiable et un
  compte de test
* les tests passent en intégration continue
* le seed rejoué sur une base déjà remplie n'insère rien
