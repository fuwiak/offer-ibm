const fs = require("fs");
const path = require("path");

/**
 * Resolve document storage root. Collectors / uploads need a string path even
 * when systemd forgot to inject STORAGE_DIR.
 */
function resolveStorageDir() {
  const fromEnv = String(process.env.STORAGE_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, "../../storage");
}

/**
 * Resolve collector hotdir for multer uploads.
 * Supports classic AnythingLLM layout and Selectel `/opt/offer-kp/{data,app}`.
 */
function resolveCollectorHotdir() {
  const fromEnv = String(process.env.COLLECTOR_HOTDIR || "").trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  const candidates = [
    // Monorepo: server/utils/files → ../../../collector/hotdir
    path.resolve(__dirname, "../../../collector/hotdir"),
  ];

  const storageDir = String(process.env.STORAGE_DIR || "").trim();
  if (storageDir) {
    candidates.push(
      // /opt/offer-kp/data → /opt/offer-kp/app/collector/hotdir
      path.resolve(storageDir, "../app/collector/hotdir"),
      path.resolve(storageDir, "../../app/collector/hotdir"),
      path.resolve(storageDir, "../collector/hotdir"),
      // Classic docker: STORAGE_DIR/../../collector/hotdir
      path.resolve(storageDir, "../../collector/hotdir")
    );
  }

  for (const candidate of candidates) {
    const parent = path.dirname(candidate);
    if (fs.existsSync(candidate) || fs.existsSync(parent)) {
      fs.mkdirSync(candidate, { recursive: true });
      return candidate;
    }
  }

  const fallback = candidates[0];
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

module.exports = {
  resolveStorageDir,
  resolveCollectorHotdir,
};
