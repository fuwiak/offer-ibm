#!/usr/bin/env bash
# Sync local/main → Selectel Lainey (/opt/offer-kp/app) + restart systemd.
# Matches docker/LAINEY_UI.md (rsync + VITE_API_BASE=/api).
#
# Usage:
#   bash scripts/deploy-lainey-sync.sh
#   yarn deploy:lainey
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

remote() {
  ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"
}

remote_log() {
  remote "mkdir -p /opt/offer-kp; touch ${DEPLOY_LOG}; printf '[%s] %s\n' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" $(printf %q "$*") >> ${DEPLOY_LOG}"
}

log "Deploy ${GIT_HASH} → ${USER}@${HOST}:${REMOTE_APP}"
log "  ${GIT_SUBJECT}"
remote_log "DEPLOY START ${GIT_HASH} ${GIT_SUBJECT}"

log "==> Frontend build (VITE_API_BASE=/api)"
remote_log "BUILD frontend"
(
  cd frontend
  if [[ ! -d node_modules ]]; then
    yarn install --frozen-lockfile || yarn install
  fi
  VITE_API_BASE=/api yarn build
)

log "==> Ensure server deps present locally for rsync (production node_modules on server)"
# Keep server/node_modules on the server — exclude from delete sync.
# Still sync package.json / yarn.lock so server can yarn install if needed.

log "==> rsync → ${REMOTE_APP}"
remote_log "RSYNC → ${REMOTE_APP}"
remote "mkdir -p ${REMOTE_APP} ${REMOTE_SRC} /opt/offer-kp/data"

rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude '**/storage/**' \
  --exclude 'server/storage/**' \
  --exclude 'collector/hotdir/**' \
  --exclude 'collector/outputs/**' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'cli/offerkp-ops' \
  --exclude 'frontend/bundleinspector.html' \
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
cd ${REMOTE_APP}/server
yarn install --production --frozen-lockfile || yarn install --production
npx prisma generate --schema=./prisma/schema.prisma || true
cd ${REMOTE_APP}/collector
yarn install --production --frozen-lockfile || yarn install --production
EOS

log "==> Publish frontend → server/public + restart systemd"
remote_log "RESTART offer-kp offer-kp-collector"
remote "bash -s" <<EOS
set -euo pipefail
mkdir -p ${REMOTE_APP}/server/public
if [ -d ${REMOTE_APP}/frontend/dist ]; then
  cp -a ${REMOTE_APP}/frontend/dist/. ${REMOTE_APP}/server/public/
elif [ -d ${REMOTE_APP}/frontend/build ]; then
  cp -a ${REMOTE_APP}/frontend/build/. ${REMOTE_APP}/server/public/
fi
# Preserve production .env if present under app tree
if [ -f /opt/offer-kp/app/server/.env ]; then
  :
elif [ -f /opt/offer-kp/.env ]; then
  cp /opt/offer-kp/.env /opt/offer-kp/app/server/.env
fi
systemctl restart offer-kp offer-kp-collector
sleep 2
systemctl is-active offer-kp
systemctl is-active offer-kp-collector || true
curl -sS -o /dev/null -w "local / : %{http_code}\\n" --max-time 15 http://127.0.0.1:3001/ || true
curl -sS -o /dev/null -w "nginx / : %{http_code}\\n" --max-time 15 http://127.0.0.1/ || true
EOS

remote "printf '%s|%s|%s\n' $(printf %q "$GIT_HASH") $(printf %q "$GIT_DATE") $(printf %q "$GIT_SUBJECT") > ${READY_FILE}"
remote_log "DEPLOY OK ${GIT_HASH}"

log "Done. http://offer-ibm.ru/  ·  offerkp status"
