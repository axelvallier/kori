---
description: Ouvre un ticket par son numéro de fichier, crée sa branche et rappelle ses critères d'acceptation
argument-hint: [numéro de ticket, 01 à 21]
allowed-tools: Bash(gh issue view *), Bash(gh issue list *), Bash(git switch *), Bash(git fetch *), Bash(git status *), Read
disable-model-invocation: true
---

# Ticket $1

Le numéro attendu est celui du **fichier** dans `docs/tickets/`, pas celui de
l'issue GitHub. Les deux ne coïncident pas : issues et pull requests partagent
un seul compteur sur GitHub, et les pull requests de Dependabot ont consommé les
premiers numéros. Le fichier est la source de vérité, l'issue en est le reflet.

## Résolution

```!
case "$1" in
  ''|*[!0-9]*) echo "Numéro de ticket attendu, entre 01 et 21. Exemple : /ticket 3"; exit 0 ;;
esac
N=$(printf '%02d' "$((10#$1))")
F=$(find docs/tickets -maxdepth 1 -name "$N-*.md" 2>/dev/null | sort | head -1)
if [ -z "$F" ]; then
  echo "Aucun ticket $N dans docs/tickets/."
  exit 0
fi
TITRE=$(sed -n 's/^title: "\(.*\)"$/\1/p' "$F" | head -1)
echo "fichier : $F"
echo "branche : $(basename "$F" .md)"
echo "titre   : $TITRE"
ISSUE=$(gh issue list --state all --limit 100 --json number,title \
          --jq '.[] | "#\(.number)\t\(.title)"' 2>/dev/null | grep -F "$TITRE" | head -1)
echo "issue   : ${ISSUE:-aucune issue correspondante trouvée}"
echo
echo "--- le ticket ---"
cat "$F"
echo
echo "--- état du dépôt ---"
git status --short --branch
```

## À faire

1. Si la résolution ci-dessus n'a trouvé aucun fichier, arrête-toi et dis-le.

2. Si une issue correspondante existe, affiche-la avec `gh issue view <numéro>`
   en reprenant le numéro trouvé ci-dessus. Si son contenu diffère du fichier,
   **le fichier gagne** et tu me signales l'écart.

3. Si le dépôt a des modifications non validées, arrête-toi et dis-le moi avant
   de changer de branche.

4. Pars de `main` à jour, puis crée la branche au nom indiqué par la résolution,
   par exemple `03-schema-rls`. Un ticket, une branche, une pull request.

5. Affiche-moi les **critères d'acceptation** du ticket, un par ligne, tels
   qu'ils sont écrits. Pour chacun, dis en une phrase comment tu comptes le
   vérifier — pas comment tu vas l'implémenter. Un ticket est fermé quand ses
   critères sont vérifiés, pas quand le code compile.

6. Attends mon feu vert avant d'écrire la moindre ligne.
