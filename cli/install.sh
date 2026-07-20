#!/usr/bin/env bash
# Install global `offerkp` command + enable git post-commit Selectel status.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/cli"
BIN_DIR="${OFFERKP_BIN_DIR:-$HOME/bin}"

mkdir -p "$BIN_DIR"
cd "$CLI"
go build -o offerkp-ops .

ln -sfn "$CLI/run" "$BIN_DIR/offerkp"
chmod +x "$CLI/run" "$ROOT/.githooks/post-commit"

git -C "$ROOT" config core.hooksPath .githooks

echo "installed: $BIN_DIR/offerkp → $CLI/run"
echo "hooksPath: $(git -C "$ROOT" config --get core.hooksPath)"
if ! command -v offerkp >/dev/null 2>&1; then
  echo "note: ensure $BIN_DIR is on PATH"
fi
offerkp help | head -8
echo "ok — offerkp | offerkp status | offerkp health | offerkp logs | offerkp build | offerkp cicd"
