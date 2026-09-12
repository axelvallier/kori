#!/usr/bin/env bash
#
# Hook PreToolUse sur `git commit` : refuse le commit si gitleaks trouve un
# secret dans les fichiers indexes.
#
# Double volontaire du hook git de .githooks/pre-commit. Les deux ne couvrent
# pas la meme chose : le hook git attrape tous les commits, quelle que soit leur
# forme, mais seulement sur cette machine et seulement si core.hooksPath a ete
# configure. Celui-ci attrape les commits de l'agent avant meme que la commande
# parte, et fonctionne des le clone puisqu'il est versionne.

set -uo pipefail

racine="${CLAUDE_PROJECT_DIR:-.}"
scan="$racine/scripts/check-secrets.sh"

# Pas de script, pas d'avis : on laisse le flux de permission normal decider.
[ -x "$scan" ] || exit 0

sortie=$("$scan" 2>&1)
statut=$?

if [ "$statut" -eq 0 ]; then
  exit 0
fi

# La sortie de gitleaks part sur stderr, elle remonte dans la transcription.
# La raison envoyee dans le JSON est une chaine fixe, sans interpolation : un
# nom de fichier contenant un guillemet casserait le JSON, et un hook qui
# produit du JSON invalide est traite comme une erreur non bloquante, donc le
# commit passerait. C'est exactement le cas qu'il ne faut pas rater.
echo "$sortie" >&2

printf '%s\n' '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "gitleaks a trouve un secret dans les fichiers indexes. Le repo est public : retire la valeur du code, remplace-la par une variable d environnement, et revoque la cle si elle a deja circule. Voir la sortie de gitleaks ci-dessus."
  }
}'
exit 0
