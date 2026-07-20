#!/usr/bin/env bash
# Deploy OfferKP UI on Lainey (Selectel only — no Railway upstream).
# Writes /var/log/offer-kp-deploy.log + /opt/offer-kp/READY for `offerkp build`.
# Usage (from laptop, SSH agent unlocked):
#   bash scripts/deploy-lainey-app.sh
# Watch live:
#   offerkp build
set -euo pipefail

HOST="${LAINEY_HOST:-87.228.90.43}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20)
IMAGE_TAG="${OFFER_KP_IMAGE_TAG:-offer-kp:lainey}"
REMOTE_PORT="${OFFER_KP_APP_PORT:-3001}"
CONTAINER_NAME="offer-kp"
DEPLOY_LOG="${OFFERKP_DEPLOY_LOG:-/opt/offer-kp/build.log}"
READY_FILE="${OFFERKP_READY_FILE:-/opt/offer-kp/READY}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GIT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_DATE="$(git log -1 --pretty=%ci 2>/dev/null || date -u +"%Y-%m-%d %H:%M:%S +0000")"
GIT_SUBJECT="$(git log -1 --pretty=%s 2>/dev/null || echo deploy)"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

remote_log() {
  # Append a line to remote deploy log (visible in offerkp build tab).
  ssh "${SSH_OPTS[@]}" "root@${HOST}" \
    "mkdir -p /opt/offer-kp; touch ${DEPLOY_LOG}; printf '[%s] %s\n' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" $(printf %q "$*") >> ${DEPLOY_LOG}"
}

log "==> Deploy ${GIT_HASH} — ${GIT_SUBJECT}"
remote_log "DEPLOY START ${GIT_HASH} ${GIT_SUBJECT}"

log "==> Building linux/amd64 image ${IMAGE_TAG}"
remote_log "BUILD image ${IMAGE_TAG}"
docker buildx build \
  --platform linux/amd64 \
  -f docker/Dockerfile \
  -t "${IMAGE_TAG}" \
  --load \
  .

log "==> Saving and uploading image to ${HOST}"
remote_log "UPLOAD image → ${HOST}"
docker save "${IMAGE_TAG}" | gzip -1 | ssh "${SSH_OPTS[@]}" "root@${HOST}" \
  "gunzip | docker load"

log "==> Writing remote env + compose"
ssh "${SSH_OPTS[@]}" "root@${HOST}" "mkdir -p /opt/offer-kp/data"

# Preserve existing secrets if .env already exists
ssh "${SSH_OPTS[@]}" "root@${HOST}" "bash -s" <<EOS
set -euo pipefail
ENVF=/opt/offer-kp/.env
if [ ! -f "\$ENVF" ]; then
  cat > "\$ENVF" <<EOF
SERVER_PORT=${REMOTE_PORT}
STORAGE_DIR=/app/server/storage
JWT_SECRET=\$(openssl rand -hex 32)
SIG_KEY=\$(openssl rand -hex 32)
SIG_SALT=\$(openssl rand -hex 32)
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL_PREF=openai/gpt-oss-20b
OFFER_KP_TEACHER_LLM=0
ELI_DISABLED=1
SHOP_DB_ENRICH=1
HOST=0.0.0.0
EOF
fi
cat > /opt/offer-kp/docker-compose.yml <<EOF
services:
  offer-kp:
    image: ${IMAGE_TAG}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    network_mode: host
    env_file:
      - .env
    environment:
      SERVER_PORT: "${REMOTE_PORT}"
      PORT: "${REMOTE_PORT}"
      STORAGE_DIR: /opt/offer-kp/data
    volumes:
      - /opt/offer-kp/data:/opt/offer-kp/data
      - /opt/offer-kp/data:/app/server/storage
EOF
EOS

log "==> Starting container"
remote_log "RESTART container ${CONTAINER_NAME}"
ssh "${SSH_OPTS[@]}" "root@${HOST}" "bash -s" <<EOS
set -euo pipefail
cd /opt/offer-kp
docker rm -f ${CONTAINER_NAME} 2>/dev/null || true
if command -v docker-compose >/dev/null; then
  docker-compose up -d
elif docker compose version >/dev/null 2>&1; then
  docker compose up -d
else
  docker run -d --name ${CONTAINER_NAME} --restart unless-stopped --network host \\
    --env-file /opt/offer-kp/.env \\
    -e SERVER_PORT=${REMOTE_PORT} -e PORT=${REMOTE_PORT} \\
    -e STORAGE_DIR=/app/server/storage \\
    -v /opt/offer-kp/data:/app/server/storage \\
    ${IMAGE_TAG}
fi
sleep 3
docker ps --filter name=${CONTAINER_NAME}
EOS

log "==> Point nginx to local app"
ssh "${SSH_OPTS[@]}" "root@${HOST}" "bash -s" <<EOS
set -euo pipefail
cat >/etc/nginx/sites-available/offer-kp-ui <<'NGX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name offer-ibm.ru www.offer-ibm.ru _;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:${REMOTE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGX
sed -i 's|\${REMOTE_PORT}|${REMOTE_PORT}|g' /etc/nginx/sites-available/offer-kp-ui
nginx -t && systemctl reload nginx
curl -sS -o /dev/null -w "local nginx->app: %{http_code}\\n" --max-time 20 http://127.0.0.1/ || true
curl -sS -o /dev/null -w "local app /ping: %{http_code}\\n" --max-time 20 http://127.0.0.1:${REMOTE_PORT}/ping || true
EOS

# READY for offerkp Status/Build tabs: hash|date|subject
ssh "${SSH_OPTS[@]}" "root@${HOST}" \
  "printf '%s|%s|%s\n' $(printf %q "$GIT_HASH") $(printf %q "$GIT_DATE") $(printf %q "$GIT_SUBJECT") > ${READY_FILE}"
remote_log "DEPLOY OK ${GIT_HASH}"

log "Done. Open http://offer-ibm.ru/ (Selectel)"
log "Watch: offerkp   |   offerkp build"
