const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const {
  loadRailwayFallbackFiles,
  applyRailwayEnvFallback,
} = require("./railwayEnvFallback");

const SERVER_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SERVER_DIR, "..");

/**
 * 1) Снимок Railway / process.env + опционально .env.railway (fallback-источник).
 * 2) server/.env и ../.env — приоритет (override), локальные файлы перебивают Railway.
 * 3) Для ключей, не заданных в .env, подставляется fallback из Railway / .env.railway.
 */
function loadEnv({ override = true } = {}) {
  const railwayFallback = loadRailwayFallbackFiles(SERVER_DIR, REPO_ROOT);

  const paths = [];
  if (process.env.NODE_ENV === "development") {
    paths.push(path.join(SERVER_DIR, `.env.${process.env.NODE_ENV}`));
  }
  paths.push(path.join(SERVER_DIR, ".env"));
  paths.push(path.join(REPO_ROOT, ".env"));

  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override });
    }
  }

  applyRailwayEnvFallback(railwayFallback);
}

module.exports = { loadEnv, SERVER_DIR, REPO_ROOT };
