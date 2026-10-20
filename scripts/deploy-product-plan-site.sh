#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/.site/product-plan"
DEPLOY_DIR="${AGENTHUB_DOCS_DEPLOY_DIR:-/home/ubuntu/agenthub-product-docs/public}"

"$REPO_ROOT/scripts/build-product-plan-site.sh"
"$REPO_ROOT/scripts/verify-product-plan-site.sh"

if [[ -z "$DEPLOY_DIR" || "$DEPLOY_DIR" == "/" ]]; then
  printf 'Refusing unsafe deploy directory: %s\n' "$DEPLOY_DIR" >&2
  exit 1
fi

install -d -m 0755 "$DEPLOY_DIR"
rsync -a --delete "$OUTPUT_DIR/" "$DEPLOY_DIR/"
test -f "$DEPLOY_DIR/index.html"
printf 'Deployed product plan site: %s\n' "$DEPLOY_DIR"
