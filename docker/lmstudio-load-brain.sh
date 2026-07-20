#!/usr/bin/env bash
# Keep the shared chat + vision model resident after server start (T4 16GB).
set -euo pipefail
export PATH="/root/.lmstudio/bin:${PATH}"
sleep 2

load_model() {
  local id="$1"
  local ctx="$2"
  lms load "$id" --context-length "$ctx" --gpu max -y
}

load_model "qwen/qwen3-vl-8b" 32768
