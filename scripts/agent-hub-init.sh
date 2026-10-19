#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
target="$root/workspace/.env"
if [[ -e "$target" ]]; then
  echo 'workspace/.env already exists; edit it in place. Nothing was overwritten.' >&2
  exit 1
fi
umask 077
password="$(openssl rand -hex 24)"
# noclobber also protects against a concurrent invocation.
(set -o noclobber; sed "s/^DB_PASSWORD=GENERATE_ME$/DB_PASSWORD=$password/" \
  "$root/workspace/agent-hub.env.example" > "$target")
echo 'Created workspace/.env. Configure URLs and optional coordinator credentials before deployment.'
