#!/usr/bin/env bash
# Bootstrap OfferKP UI access on Lainey (Selectel GPU) via public IP.
# Russia cannot reach Railway; Lainey IP proxies to the app (or self-hosts later).
#
# Repo is PRIVATE — raw.githubusercontent.com returns 404 without auth.
# On Lainey (Selectel Console / SSH), copy this file then:
#   sudo bash deploy-lainey-ui-proxy.sh
# From laptop (after SSH key is on Lainey):
#   scp scripts/deploy-lainey-ui-proxy.sh root@87.228.90.43:/tmp/
#   ssh root@87.228.90.43 'bash /tmp/deploy-lainey-ui-proxy.sh'
#
# Result URL: http://87.228.90.43/
set -euo pipefail

UPSTREAM="${OFFER_KP_UPSTREAM_URL:-https://offerllm-production.up.railway.app}"
LISTEN_PORT="${OFFER_KP_UI_PORT:-80}"
HOST_HEADER="$(echo "$UPSTREAM" | sed -E 's#https?://##' | cut -d/ -f1)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx curl

cat >/etc/nginx/sites-available/offer-kp-ui <<EOF
server {
    listen ${LISTEN_PORT} default_server;
    listen [::]:${LISTEN_PORT} default_server;
    server_name _;

    client_max_body_size 100m;

    location / {
        proxy_pass ${UPSTREAM};
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_protocols TLSv1.2 TLSv1.3;

        proxy_set_header Host ${HOST_HEADER};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;

        # SSE + agent websockets
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/offer-kp-ui /etc/nginx/sites-enabled/offer-kp-ui
nginx -t
systemctl enable nginx
systemctl restart nginx

# Open local firewall if ufw is active (Selectel panel security group may still be needed)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${LISTEN_PORT}/tcp" || true
fi

echo ""
echo "OK — OfferKP UI proxy listening on :${LISTEN_PORT}"
echo "Public URL: http://87.228.90.43/"
echo "Upstream:   ${UPSTREAM}"
curl -sI -o /dev/null -w "Local check: %{http_code}\n" --max-time 10 "http://127.0.0.1:${LISTEN_PORT}/" || true
