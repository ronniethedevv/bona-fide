#!/usr/bin/env bash
# Bona Fide dev bootstrap. Idempotent; safe to re-run. Intended to be called by
# the cloud environment's setup script so every fresh session is ready to build.
#
#   - re-attaches the AI context worktree at ./.context from the orphan branch
#   - ensures the Rust wasm target for the NEAR contract
#   - installs Node deps for the agent and web packages (if present)
#
# It never prints secrets and never touches the main repo's tracked files.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CONTEXT_BRANCH="${CONTEXT_BRANCH:-context}"

echo "==> Bona Fide dev setup in $ROOT"

# 1) AI context worktree (lives only on the orphan branch; .context is gitignored).
if [ ! -e .context ]; then
  if git fetch origin "$CONTEXT_BRANCH" 2>/dev/null; then
    git worktree add .context "$CONTEXT_BRANCH" 2>/dev/null \
      || git worktree add .context "origin/$CONTEXT_BRANCH" 2>/dev/null \
      || echo "   (could not add .context worktree; branch '$CONTEXT_BRANCH' may not exist yet)"
  else
    echo "   (context branch '$CONTEXT_BRANCH' not on origin yet; skipping)"
  fi
else
  git -C .context pull --ff-only 2>/dev/null || true
fi

# 2) Rust wasm target for the contract.
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
fi

# 3) Node deps.
if [ -f agent/package.json ]; then (cd agent && npm ci 2>/dev/null || npm install); fi
if [ -f web/package.json ];   then (cd web   && npm ci 2>/dev/null || npm install); fi

echo "==> Done."
