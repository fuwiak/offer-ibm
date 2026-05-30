#!/bin/bash
set -e

# ── colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; YLW='\033[0;33m'; GRN='\033[0;32m'; CYN='\033[0;36m'; RST='\033[0m'
log()  { echo -e "${CYN}[entrypoint]${RST} $*"; }
ok()   { echo -e "${GRN}[entrypoint]${RST} $*"; }
warn() { echo -e "${YLW}[entrypoint]${RST} $*"; }
err()  { echo -e "${RED}[entrypoint]${RST} $*"; }
# ────────────────────────────────────────────────────────────────────────────

log "=== BOOT START ==="
log "Raw env: PORT=${PORT:-<unset>}  SERVER_PORT=${SERVER_PORT:-<unset>}  NODE_ENV=${NODE_ENV:-<unset>}"

# Railway injects PORT; AnythingLLM uses SERVER_PORT for the HTTP server
export SERVER_PORT="${PORT:-${SERVER_PORT:-3000}}"
export PORT="$SERVER_PORT"
# Patch .env so Node.js dotenv override can't revert to a stale port value
sed -i "s/^SERVER_PORT=.*/SERVER_PORT=${SERVER_PORT}/" /app/server/.env 2>/dev/null || true

ok "Resolved port: SERVER_PORT=${SERVER_PORT}  (verified in .env: $(grep SERVER_PORT /app/server/.env || echo 'not found'))"

log "Applying offer-kp OpenRouter LLM defaults to .env..."
node /app/server/config/applyOfferKpLlmDefaults.js || warn "Could not sync offer-kp LLM defaults"

export HOST="${HOST:-0.0.0.0}"
export CHECKPOINT_DISABLE=1
export ANYTHINGLLM_CHROMIUM_ARGS="${ANYTHINGLLM_CHROMIUM_ARGS:---no-sandbox,--disable-setuid-sandbox}"

# Persisted data directory (Railway volume or default)
if [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
  export STORAGE_DIR="$RAILWAY_VOLUME_MOUNT_PATH"
  log "Railway volume detected: STORAGE_DIR=${STORAGE_DIR}"
else
  export STORAGE_DIR="${STORAGE_DIR:-/app/server/storage}"
  warn "No Railway volume — using ephemeral storage: ${STORAGE_DIR}"
fi

# Prisma SQLite path is always file:../storage/anythingllm.db → /app/server/storage
if [ "$STORAGE_DIR" != "/app/server/storage" ]; then
  mkdir -p "$STORAGE_DIR"
  if [ -d /app/server/storage ] && [ ! -L /app/server/storage ]; then
    log "Removing image storage dir to replace with symlink..."
    rm -rf /app/server/storage
  fi
  mkdir -p "$(dirname /app/server/storage)"
  ln -sfn "$STORAGE_DIR" /app/server/storage
  ok "Symlink: /app/server/storage -> ${STORAGE_DIR}"
fi
export STORAGE_DIR="/app/server/storage"

log "Current user: $(id)"
log "Storage dir owner: $(ls -ld /app/server/storage 2>&1)"
# Fix ownership so anythingllm (if we ever drop) can write; as root this always works
chown -R 1000:1000 /app/server/storage 2>/dev/null && ok "chown storage -> 1000:1000" || warn "chown failed (non-root?), continuing"
mkdir -p "$STORAGE_DIR/documents" "$STORAGE_DIR/vector-cache" \
  "$STORAGE_DIR/direct-uploads" "$STORAGE_DIR/lancedb" \
  "$STORAGE_DIR/assets" \
  /app/collector/hotdir /app/collector/outputs || warn "Some storage subdirs could not be created"

# Seed offer-kp default logos on fresh Railway volumes
DEFAULT_ASSETS="/app/server/default-assets"
if [ -d "$DEFAULT_ASSETS" ]; then
  for logo in av-elia-bot.png av-elia-bot-dark.png; do
    if [ ! -s "$STORAGE_DIR/assets/$logo" ] && [ -f "$DEFAULT_ASSETS/$logo" ]; then
      cp "$DEFAULT_ASSETS/$logo" "$STORAGE_DIR/assets/$logo"
      ok "Seeded default logo: $logo"
    fi
  done
fi

ok "Storage dirs ready at ${STORAGE_DIR}"
log "Storage contents: $(ls /app/server/storage 2>&1)"

PRISMA_BIN="/app/server/node_modules/.bin/prisma"
if [ ! -x "$PRISMA_BIN" ]; then
  err "Prisma CLI not found at $PRISMA_BIN — aborting"
  exit 1
fi
ok "Prisma found: $PRISMA_BIN"

log "Running Prisma migrate deploy..."
cd /app/server
set +e
"$PRISMA_BIN" migrate deploy --schema=./prisma/schema.prisma
MIGRATE_EXIT=$?
set -e
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  warn "migrate deploy failed (exit ${MIGRATE_EXIT}), falling back to db push..."
  set +e
  "$PRISMA_BIN" db push --schema=./prisma/schema.prisma --skip-generate
  PUSH_EXIT=$?
  set -e
  if [ "$PUSH_EXIT" -ne 0 ]; then
    err "db push also failed (exit ${PUSH_EXIT}) — server may not start cleanly"
  else
    ok "db push succeeded"
  fi
else
  ok "Migrations applied"
fi

log "Ensuring OfferKP tables exist (repair for baselined DBs)..."
node -e "require('/app/server/utils/boot/ensureOfferKpTables').ensureOfferKpTables().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(0)})" \
  || warn "OfferKP table repair skipped"

# Auto-generate JWT_SECRET if not provided so logins work on first boot
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  export JWT_SECRET
  # Persist into .env so dotenv picks it up on restart (best-effort)
  if grep -q "^JWT_SECRET=" /app/server/.env 2>/dev/null; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" /app/server/.env
  else
    echo "JWT_SECRET=${JWT_SECRET}" >> /app/server/.env
  fi
  warn "JWT_SECRET was unset — generated and written to .env. Set it as a Railway env var to make it permanent."
else
  ok "JWT_SECRET is set."
fi

log "Starting document collector (background)..."
node /app/collector/index.js &
COLLECTOR_PID=$!
ok "Collector PID=${COLLECTOR_PID}"

cleanup() {
  warn "Shutting down — killing collector PID=${COLLECTOR_PID}"
  kill "$COLLECTOR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ok "=== Starting server on ${HOST}:${SERVER_PORT} ==="
exec node /app/server/index.js
