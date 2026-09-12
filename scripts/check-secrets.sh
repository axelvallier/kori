#!/usr/bin/env bash
#
# Scan des secrets sur l'index git, avant qu'ils partent dans un commit.
#
# Ce repo est public. Un secret commite est un secret brule : reecrire
# l'historique ne le rattrape pas, il faut revoquer la cle. Le seul moment utile
# pour l'attraper est donc celui-ci, avant que le commit existe.
#
# Absence de gitleaks : on avertit, on ne bloque pas. Un outil qui empeche de
# commiter parce qu'il n'est pas installe se fait desactiver le jour meme, et on
# perd la protection pour de bon.

set -uo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "check-secrets : gitleaks introuvable, scan ignore." >&2
  echo "               Installation : brew install gitleaks" >&2
  exit 0
fi

# gitleaks a renomme 'protect' en 'git' a partir de la v8.21 ; 'protect' marche
# encore mais affiche un avertissement de depreciation. On prend la forme que
# comprend le binaire installe.
if gitleaks protect --help >/dev/null 2>&1; then
  gitleaks protect --staged --redact
else
  gitleaks git --staged --redact .
fi

status=$?

if [ "$status" -ne 0 ]; then
  echo "" >&2
  echo "check-secrets : gitleaks a trouve un secret dans les fichiers indexes." >&2
  echo "               Le commit est refuse. Retire la valeur, remplace-la par" >&2
  echo "               une variable d'environnement, et revoque la cle si elle" >&2
  echo "               a deja circule." >&2
fi

exit "$status"
