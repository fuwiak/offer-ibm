const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const SERVER_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SERVER_DIR, "..");

/**
 * Загружает .env: server/.env, затем ../.env (корень репо) — без перезаписи уже заданных ключей.
 * Так DB_* из корневого .env подхватываются при SHOP_DB_* в server/.env.
 */
function loadEnv({ override = false } = {}) {
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
}

module.exports = { loadEnv, SERVER_DIR, REPO_ROOT };
