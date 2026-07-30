#!/usr/bin/env bash
# Sync local/main → Selectel Lainey (/opt/offer-kp/app) + restart systemd.
# Matches docker/LAINEY_UI.md (rsync + VITE_API_BASE=/api).
#
# Usage:
#   bash scripts/deploy-lainey-sync.sh
#   yarn deploy:lainey
#   SKIP_FRONTEND=1 yarn deploy:lainey          # server-only: skip vite (~4 min)
#   yarn deploy:lainey:server                   # same as SKIP_FRONTEND=1
#
# Live watch:
#   offerkp build
set -euo pipefail

HOST="${LAINEY_HOST:-87.228.90.43}"
USER="${LAINEY_SSH_USER:-root}"
SSH_KEY="${OFFERKP_SSH_KEY:-${LAINEY_SSH_KEY:-$HOME/.ssh/lainey_offer_ibm}}"
REMOTE_APP="${OFFERKP_REMOTE_APP:-/opt/offer-kp/app}"
REMOTE_SRC="${OFFERKP_REMOTE_SRC:-/opt/offer-kp/src}"
DEPLOY_LOG="${OFFERKP_DEPLOY_LOG:-/opt/offer-kp/build.log}"
READY_FILE="${OFFERKP_READY_FILE:-/opt/offer-kp/READY}"
SKIP_FRONTEND_RAW="$(printf '%s' "${SKIP_FRONTEND:-0}" | tr '[:upper:]' '[:lower:]')"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GIT_HASH="$(git rev-parse --short HEAD)"
GIT_FULL="$(git rev-parse HEAD)"
GIT_DATE="$(git log -1 --pretty=%ci)"
GIT_SUBJECT="$(git log -1 --pretty=%s)"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

skip_frontend() {
  case "$SKIP_FRONTEND_RAW" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

remote() {
  ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"
}

remote_log() {
  remote "mkdir -p /opt/offer-kp; touch ${DEPLOY_LOG}; printf '[%s] %s\n' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" $(printf %q "$*") >> ${DEPLOY_LOG}"
}

# Drop stale docker build noise (Canceled: context canceled) so `offerkp build` stays readable.
rotate_deploy_log() {
  remote "bash -s" <<EOS
set -euo pipefail
LOG=${DEPLOY_LOG}
mkdir -p /opt/offer-kp
if [ -f "\$LOG" ] && [ -s "\$LOG" ]; then
  # Keep only sync-deploy lines from previous runs; archive the rest.
  if grep -q 'Canceled: context canceled\\|#24 CANCELED\\|docker driver' "\$LOG" 2>/dev/null; then
    mv "\$LOG" "\${LOG}.docker-stale.\$(date -u +%Y%m%dT%H%M%SZ)"
  elif [ "\$(wc -c < "\$LOG")" -gt 200000 ]; then
    tail -n 200 "\$LOG" > "\${LOG}.tmp" && mv "\${LOG}.tmp" "\$LOG"
  fi
fi
: > "\$LOG"
printf '[%s] %s\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "LOG rotated — sync deploy ${GIT_HASH}" >> "\$LOG"
EOS
}

log "Deploy ${GIT_HASH} → ${USER}@${HOST}:${REMOTE_APP}"
log "  ${GIT_SUBJECT}"
if skip_frontend; then
  log "  SKIP_FRONTEND=1 — keep remote UI, sync server only"
fi
rotate_deploy_log
remote_log "DEPLOY START ${GIT_HASH} ${GIT_SUBJECT}$(skip_frontend && printf ' SKIP_FRONTEND' || true)"

if skip_frontend; then
  log "==> Frontend build skipped (SKIP_FRONTEND=1)"
  remote_log "BUILD frontend SKIPPED"
else
  log "==> Frontend build (VITE_API_BASE=/api)"
  remote_log "BUILD frontend"
  (
    cd frontend
    if [[ ! -d node_modules ]]; then
      yarn install --frozen-lockfile || yarn install
    fi
    VITE_API_BASE=/api yarn build
  )
fi

log "==> Ensure server deps present locally for rsync (production node_modules on server)"
# Keep server/node_modules on the server — exclude from delete sync.
# Still sync package.json / yarn.lock so server can yarn install if needed.

log "==> rsync → ${REMOTE_APP}"
remote_log "RSYNC → ${REMOTE_APP}"
remote "mkdir -p ${REMOTE_APP} ${REMOTE_SRC} /opt/offer-kp/data"

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .git
  --exclude '**/storage/**'
  --exclude 'server/storage/**'
  --exclude 'collector/hotdir/**'
  --exclude 'collector/outputs/**'
  --exclude '.env'
  --exclude '.env.*'
  --exclude 'cli/offerkp-ops'
  --exclude 'frontend/bundleinspector.html'
)
if skip_frontend; then
  # Do not wipe live UI assets when local vite build was skipped.
  RSYNC_EXCLUDES+=(
    --exclude 'frontend/dist'
    --exclude 'frontend/build'
    --exclude 'server/public'
  )
fi

rsync -az --delete \
  "${RSYNC_EXCLUDES[@]}" \
  -e "$RSYNC_SSH" \
  ./ "${USER}@${HOST}:${REMOTE_APP}/"

# Keep a git checkout in sync for offerkp Status commit display
log "==> git sync ${REMOTE_SRC}"
remote_log "GIT SYNC ${REMOTE_SRC}"
remote "bash -s" <<EOS
set -euo pipefail
SRC=${REMOTE_SRC}
if [ ! -d "\$SRC/.git" ]; then
  git clone --depth 50 https://github.com/fuwiak/offer-ibm.git "\$SRC"
fi
cd "\$SRC"
git fetch --depth 50 origin main
git checkout -B main origin/main
git reset --hard ${GIT_FULL}
EOS

log "==> yarn install (server + collector) on host"
remote_log "YARN install server/collector"
remote "bash -s" <<EOS
set -euo pipefail
if ! command -v pdftoppm >/dev/null 2>&1 || ! command -v tesseract >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -yq --no-install-recommends \
    poppler-utils tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng
fi
cd ${REMOTE_APP}/server
yarn install --production --frozen-lockfile || yarn install --production
npx prisma generate --schema=./prisma/schema.prisma || true
cd ${REMOTE_APP}/collector
yarn install --production --frozen-lockfile || yarn install --production
EOS

if skip_frontend; then
  log "==> Keep remote frontend/public + restart systemd"
  remote_log "RESTART offer-kp offer-kp-collector (UI unchanged)"
  PUBLISH_FRONTEND=0
else
  log "==> Publish frontend → server/public + restart systemd"
  remote_log "RESTART offer-kp offer-kp-collector"
  PUBLISH_FRONTEND=1
fi
remote "bash -s" <<EOS
set -euo pipefail
PUBLISH_FRONTEND=${PUBLISH_FRONTEND}
mkdir -p ${REMOTE_APP}/server/public
if [ "\$PUBLISH_FRONTEND" = "1" ]; then
  if [ -d ${REMOTE_APP}/frontend/dist ]; then
    cp -a ${REMOTE_APP}/frontend/dist/. ${REMOTE_APP}/server/public/
  elif [ -d ${REMOTE_APP}/frontend/build ]; then
    cp -a ${REMOTE_APP}/frontend/build/. ${REMOTE_APP}/server/public/
  fi
fi
# Preserve production .env if present under app tree
if [ -f /opt/offer-kp/app/server/.env ]; then
  ENV_FILE=/opt/offer-kp/app/server/.env
elif [ -f /opt/offer-kp/.env ]; then
  cp /opt/offer-kp/.env /opt/offer-kp/app/server/.env
  ENV_FILE=/opt/offer-kp/app/server/.env
else
  ENV_FILE=/opt/offer-kp/app/server/.env
fi

# T4 fast profile: one resident multimodal model. This removes 30-60 second
# unload/load cycles between OCR and chat and prevents active streams being
# terminated by a model switch.
touch "\$ENV_FILE"
for pair in \
  "LMSTUDIO_MODEL_PREF=qwen/qwen3-vl-8b" \
  "LMSTUDIO_OCR_MODEL_PREF=qwen/qwen3-vl-8b" \
  "OFFER_KP_PIPELINE_VISION_MODEL=qwen/qwen3-vl-8b" \
  "OFFER_KP_PIPELINE_AGENT_MODEL=qwen/qwen3-vl-8b" \
  "OFFER_KP_PIPELINE_AGENT_FALLBACK=qwen/qwen3-vl-8b" \
  "OFFER_KP_SINGLE_MODEL=true" \
  "OFFER_KP_VISION_OCR_DPI=150" \
  "SHOP_DB_BM25=1" \
  "SHOP_DB_BM25_TOP_K=80" \
  "SHOP_DB_DENSE_RESCUE_TOP_K=80" \
  "SHOP_DB_CATALOG_DENSE_TOP_K=80" \
  "SHOP_DB_RETRIEVAL_WINDOW=100" \
  "SHOP_DB_RRF_COMPATIBLE_LIMIT=90" \
  "SHOP_DB_RRF_ANALOG_LIMIT=10" \
  "SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC=0" \
  "SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC=0" \
  "OFFER_KP_QUEUE=1" \
  "OFFER_KP_REDIS_URL=redis://127.0.0.1:6379" \
  "OFFER_KP_GPU_WORKER_CONCURRENCY=1" \
  "OFFER_KP_MATCHING_WORKER_CONCURRENCY=1" \
  "OFFER_KP_EXPORT_WORKER_CONCURRENCY=2" \
  "OFFER_KP_MATCH_CONCURRENCY=1" \
  "SHOP_DB_CATALOG_EMBED_CONCURRENCY=4" \
  "OFFER_KP_DURABLE_MATCH_CACHE=1" \
  "OFFER_KP_DURABLE_MATCH_TTL_SEC=1209600" \
  "OFFER_KP_DURABLE_OCR_CACHE=1" \
  "OFFER_KP_OCR_DISK_TTL_SEC=7776000" \
  "OFFER_KP_PIPELINE_VERSION=2026-07-30" \
  "OFFER_KP_OCR_PROMPT_VERSION=v1"; do
  key="\${pair%%=*}"
  if grep -q "^\${key}=" "\$ENV_FILE"; then
    sed -i "s|^\${key}=.*|\${pair}|" "\$ENV_FILE"
  else
    printf '%s\n' "\$pair" >> "\$ENV_FILE"
  fi
done

# Redis + BullMQ workers (GPU OCR concurrency 1, CPU matching/export).
if ! command -v redis-server >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -yq --no-install-recommends redis-server
fi
# Bind localhost only; disable protected-mode warnings for local workers.
if [ -f /etc/redis/redis.conf ]; then
  sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf || true
  if ! grep -q '^bind 127.0.0.1' /etc/redis/redis.conf; then
    sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf || true
  fi
fi
systemctl enable redis-server >/dev/null 2>&1 || true
systemctl restart redis-server || systemctl start redis-server
sleep 1
redis-cli ping || true

install -m 644 ${REMOTE_APP}/docker/offer-kp-gpu-worker.service /etc/systemd/system/offer-kp-gpu-worker.service
install -m 644 ${REMOTE_APP}/docker/offer-kp-cpu-worker.service /etc/systemd/system/offer-kp-cpu-worker.service
systemctl daemon-reload
systemctl enable offer-kp-gpu-worker offer-kp-cpu-worker >/dev/null 2>&1 || true

systemctl restart offer-kp offer-kp-collector offer-kp-gpu-worker offer-kp-cpu-worker
sleep 2
systemctl is-active offer-kp
systemctl is-active offer-kp-collector || true
systemctl is-active redis-server || true
systemctl is-active offer-kp-gpu-worker || true
systemctl is-active offer-kp-cpu-worker || true
curl -sS -o /dev/null -w "local / : %{http_code}\\n" --max-time 15 http://127.0.0.1:3001/ || true
curl -sS -o /dev/null -w "nginx / : %{http_code}\\n" --max-time 15 http://127.0.0.1/ || true
EOS

remote "printf '%s|%s|%s\n' $(printf %q "$GIT_HASH") $(printf %q "$GIT_DATE") $(printf %q "$GIT_SUBJECT") > ${READY_FILE}"
remote_log "DEPLOY OK ${GIT_HASH}"

log "Done. http://offer-ibm.ru/  ·  offerkp status"
