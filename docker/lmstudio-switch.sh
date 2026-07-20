#!/usr/bin/env bash
# Resident-model control for Lainey T4.
# Usage:
#   ./lmstudio-switch.sh eyes|brain|status|unload
#   yarn lms:switch brain
# From laptop:
#   ssh root@87.228.90.43 'bash /opt/offer-kp/app/docker/lmstudio-switch.sh brain'
set -euo pipefail
export PATH="/root/.lmstudio/bin:${PATH}"

VISION="${OFFER_KP_PIPELINE_VISION_MODEL:-qwen/qwen3-vl-8b}"
AGENT="${OFFER_KP_PIPELINE_AGENT_MODEL:-qwen/qwen3-vl-8b}"
FALLBACK="${OFFER_KP_PIPELINE_AGENT_FALLBACK:-qwen/qwen3-vl-8b}"
AGENT_CTX="${OFFER_KP_PIPELINE_AGENT_CONTEXT:-32768}"
VISION_CTX="${OFFER_KP_PIPELINE_VISION_CONTEXT:-8192}"

cmd="${1:-status}"

load_one() {
  local id="$1"
  local ctx="$2"
  echo "→ unload all"
  lms unload --all || true
  sleep 2
  echo "→ load $id (ctx $ctx)"
  lms load "$id" --context-length "$ctx" --gpu max -y
}

case "$cmd" in
  eyes|vision|ocr|oczy)
    load_one "$VISION" "$VISION_CTX"
    ;;
  brain|agent|chat|mozog)
    if ! load_one "$AGENT" "$AGENT_CTX"; then
      echo "WARN: $AGENT failed — fallback $FALLBACK" >&2
      load_one "$FALLBACK" 32768
    fi
    ;;
  unload|free|idle)
    echo "→ unload all"
    lms unload --all || true
    ;;
  status|st|ps)
    echo "eyes:  $VISION"
    echo "brain: $AGENT (ctx $AGENT_CTX, fallback $FALLBACK)"
    echo "--- loaded ---"
    lms ps 2>/dev/null || lms status 2>/dev/null || true
    nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || true
    ;;
  -h|--help|help)
    sed -n '2,8p' "$0"
    ;;
  *)
    echo "Usage: $0 eyes|brain|status|unload" >&2
    exit 2
    ;;
esac
