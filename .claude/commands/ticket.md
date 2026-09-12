---
description: Ouvre un ticket, crée sa branche et rappelle ses critères d'acceptation
argument-hint: [numéro d'issue]
allowed-tools: Bash(gh issue view *), Bash(git switch *), Bash(git checkout *), Bash(git status *), Bash(git fetch *), Read
disable-model-invocation: true
---

# Ticket $1

## L'issue GitHub

!`gh issue view $1 2>&1 || echo "Pas d'issue $1 accessible. Le fichier du ticket dans docs/tickets/ reste la source de vérité."`

## État du dépôt

```!
git status --short --branch
```

## À faire

1. Lis le fichier du ticket dans `docs/tickets/`, celui dont le nom commence par
   le numéro `$1` sur deux chiffres. C'est la source de vérité, l'issue n'en est
   que le reflet ; en cas d'écart entre les deux, le fichier gagne et tu me le
   signales.

2. Si le dépôt a des modifications non validées, arrête-toi et dis-le moi avant
   de changer de branche.

3. Pars de `main` à jour, puis crée la branche `$1-<slug>`, où `<slug>` reprend
   celui du nom de fichier du ticket. Exemple : pour `03-schema-rls.md`, la
   branche est `03-schema-rls`.

4. Affiche-moi les **critères d'acceptation** du ticket, un par ligne, tels
   qu'ils sont écrits. Pour chacun, dis en une phrase comment tu comptes le
   vérifier — pas comment tu vas l'implémenter. Un ticket est fermé quand ses
   critères sont vérifiés, pas quand le code compile.

5. Attends mon feu vert avant d'écrire la moindre ligne.
