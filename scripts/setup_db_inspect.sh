#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Обход SSLCertVerificationError на macOS (python.org / Xcode CLT Python).
python3 -m pip install \
  --trusted-host pypi.org \
  --trusted-host pypi.python.org \
  --trusted-host files.pythonhosted.org \
  -r scripts/requirements-db-inspect.txt

echo "Готово. Запуск: python3 scripts/inspect_mysql_db.py"
