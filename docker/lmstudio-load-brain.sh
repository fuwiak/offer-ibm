#!/usr/bin/env bash
# Load agent brain into LM Studio after server start (T4 16GB).
# Prefer gpt-oss-20b; fall back to qwen3-vl-8b if missing/OOM.
set -euo pipefail
export PATH="/root/.lmstudio/bin:${PATH}"
sleep 2

load_model() {
  local id="$1"
  local ctx="$2"
  lms load "$id" --context-length "$ctx" --gpu max -y
}

if load_model "openai/gpt-oss-20b" 8192; then
  exit 0
fi
echo "WARN: gpt-oss-20b load failed — falling back to qwen/qwen3-vl-8b" >&2
load_model "qwen/qwen3-vl-8b" 32768
