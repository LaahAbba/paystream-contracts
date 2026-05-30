#!/usr/bin/env bash
# Pre-commit hook: formatting, linting, and secret scanning.
# Install: make install-hooks

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM)

# ── Rust checks (only when .rs files are staged) ─────────────────────────────
if echo "$STAGED" | grep -q '\.rs$'; then
  echo "pre-commit: running cargo fmt --check"
  cargo fmt --check

  echo "pre-commit: running cargo clippy"
  cargo clippy --all-targets -- -D warnings
fi

# ── JS/TS checks (only when .js/.ts files are staged) ────────────────────────
if echo "$STAGED" | grep -qE '\.(js|ts)$'; then
  if command -v npx &>/dev/null; then
    echo "pre-commit: running eslint"
    echo "$STAGED" | grep -E '\.(js|ts)$' | xargs npx eslint --max-warnings=0
  else
    echo "pre-commit: npx not found — skipping ESLint (install Node.js to enable)"
  fi
fi

# ── Secret scanning ───────────────────────────────────────────────────────────
if command -v gitleaks &>/dev/null; then
  echo "pre-commit: running gitleaks"
  gitleaks protect --staged --config .gitleaks.toml --redact
else
  echo "pre-commit: gitleaks not found — skipping secret scan (install from https://github.com/gitleaks/gitleaks/releases)"
fi
