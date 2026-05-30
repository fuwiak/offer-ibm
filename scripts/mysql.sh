#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# mysql-client 9.x не поддерживает mysql_native_password на сервере.
MYSQL8=(
  "/usr/local/opt/mysql-client@8.0/bin/mysql"
  "/opt/homebrew/opt/mysql-client@8.0/bin/mysql"
)

for bin in "${MYSQL8[@]}"; do
  if [[ -x "$bin" ]]; then
    exec "$bin" "$@"
  fi
done

exec python3 "$ROOT/scripts/mysql_cli.py" "$@"
