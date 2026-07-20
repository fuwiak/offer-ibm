#!/usr/bin/env bash
# Deploy OfferKP UI on Lainey (Selectel only — no Railway upstream).
# Usage (from laptop, SSH agent unlocked):
#   bash scripts/deploy-lainey-app.sh
set -euo pipefail

HOST="${LAINEY_HOST:-87.228.90.43}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20)
IMAGE_TAG="${OFFER_KP_IMAGE_TAG:-offer-kp:lainey}"
REMOTE_PORT="${OFFER_KP_APP_PORT:-3001}"
CONTAINER_NAME="offer-kp"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building linux/amd64 image ${IMAGE_TAG}"
docker buildx build \
  --platform linux/amd64 \
  -f docker/Dockerfile \
  -t "${IMAGE_TAG}" \
  --load \
  .

echo "==> Saving and uploading image to ${HOST}"
docker save "${IMAGE_TAG}" | gzip -1 | ssh "${SSH_OPTS[@]}" "root@${HOST}" \
  "gunzip | docker load"

echo "==> Writing remote env + compose"
ssh "${SSH_OPTS[@]}" "root@${HOST}" "mkdir -p /opt/offer-kp/data"

# Minimal production env for Selectel (LM Studio on same host)
ssh "${SSH_OPTS[@]}" "root@${HOST}" "cat > /opt/offer-kp/.env" <<EOF
SERVER_PORT=${REMOTE_PORT}
STORAGE_DIR=/app/server/storage
JWT_SECRET=$(openssl rand -hex 32)
SIG_KEY=$(openssl rand -hex 32)
SIG_SALT=$(openssl rand -hex 32)
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL_PREF=openai/gpt-oss-20b
OFFER_KP_TEACHER_LLM=0
ELI_DISABLED=1
SHOP_DB_ENRICH=1
HOST=0.0.0.0
EOF

ssh "${SSH_OPTS[@]}" "root@${HOST}" "cat > /opt/offer-kp/docker-compose.yml" <<EOF
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

echo "==> Starting container"
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

echo "==> Point nginx to local app (no Railway)"
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
# fix port interpolation
sed -i 's|\${REMOTE_PORT}|${REMOTE_PORT}|g' /etc/nginx/sites-available/offer-kp-ui
nginx -t && systemctl reload nginx
curl -sI -o /dev/null -w "local nginx->app: %{http_code}\\n" --max-time 20 http://127.0.0.1/ || true
curl -sI -o /dev/null -w "local app: %{http_code}\\n" --max-time 20 http://127.0.0.1:${REMOTE_PORT}/api/ping || true
EOS

echo "Done. Open http://offer-ibm.ru/ (Selectel only)"
