#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${AGENTHUB_DOCS_VENV:-$HOME/.cache/agenthub-product-docs-venv}"
OUTPUT_DIR="${AGENTHUB_DOCS_OUTPUT:-$REPO_ROOT/.site/product-plan}"
CONFIG="$REPO_ROOT/docs/product-plan-site.yml"
SOURCE_DIR="$REPO_ROOT/docs/.product-plan-site-src"
SOURCE_PLAN="$REPO_ROOT/docs/plans/2026-10-20-agenthub-mobile-desktop-product-plan.md"

if [[ ! -x "$VENV_DIR/bin/mkdocs" ]]; then
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install --disable-pip-version-check --quiet \
    'mkdocs==1.6.1' 'mkdocs-material==9.6.20'
fi

rm -rf "$OUTPUT_DIR" "$SOURCE_DIR"
mkdir -p "$SOURCE_DIR"
cp "$SOURCE_PLAN" "$SOURCE_DIR/index.md"
"$VENV_DIR/bin/mkdocs" build --strict --config-file "$CONFIG"
rm -rf "$SOURCE_DIR"
printf 'Built product plan site: %s\n' "$OUTPUT_DIR"
