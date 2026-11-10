#!/usr/bin/env bash
# Fails if any AI context file is tracked or staged in the main repo.
set -euo pipefail
pattern='(^|/)(CLAUDE\.md|agents\.md|AGENTS\.md)$|^\.context(/|$)|^docs/context/|-spec\.md$'
tracked=$(git ls-files | grep -E "$pattern" || true)
staged=$(git diff --cached --name-only | grep -E "$pattern" || true)
if [ -n "$tracked$staged" ]; then
  echo "Context files must not be in the main repo:"
  printf '%s\n' "$tracked" "$staged" | sed '/^$/d'
  exit 1
fi
echo "OK: no context files tracked."
