/**
 * Цветные логи ShopDB для Railway (фильтр в dashboard: [ShopDB]).
 */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

const TAG = `${C.cyan}[ShopDB]${C.reset}`;

function isRailway() {
  return !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
  );
}

function shouldRunBootTest() {
  const flag = (process.env.SHOP_DB_BOOT_TEST || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(flag)) return false;
  if (["1", "true", "yes", "on"].includes(flag)) return true;
  return isRailway();
}

function formatMeta(meta) {
  if (meta == null) return "";
  if (typeof meta === "string") return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function line(levelColor, levelLabel, message, meta) {
  const metaStr = meta !== undefined ? ` ${C.dim}${formatMeta(meta)}${C.reset}` : "";
  console.log(
    `${TAG} ${levelColor}${levelLabel}${C.reset} ${message}${metaStr}`
  );
}

function info(message, meta) {
  line(C.blue, "INFO", message, meta);
}

function ok(message, meta) {
  line(C.green, "OK", message, meta);
}

function warn(message, meta) {
  line(C.yellow, "WARN", message, meta);
}

function error(message, meta) {
  line(C.red, "FAIL", message, meta);
}

function skip(message, meta) {
  line(C.dim, "SKIP", message, meta);
}

function enrichStart(payload) {
  info("enrich start", payload);
}

function enrichDone(payload) {
  ok("enrich done", payload);
}

function enrichTimeout(payload) {
  warn("enrich timeout", payload);
}

function enrichError(err, payload = {}) {
  warn("enrich error", {
    ...payload,
    error: err?.message || String(err),
  });
}

function agentRun(payload) {
  info("search agent", payload);
}

function agentDone(payload) {
  ok("search agent done", payload);
}

/** Для CLI-тестов (verify-offerkp-env.cjs) */
function testPass(name, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`${TAG} ${C.green}✓ PASS${C.reset} ${name}${suffix}`);
}

function testFail(name, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.error(`${TAG} ${C.red}✗ FAIL${C.reset} ${name}${suffix}`);
}

function testWarn(name, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`${TAG} ${C.yellow}! WARN${C.reset} ${name}${suffix}`);
}

function testBanner(title) {
  console.log(
    `\n${TAG} ${C.magenta}━━━ ${title} ━━━${C.reset}${
      isRailway() ? ` ${C.dim}(Railway)${C.reset}` : ""
    }\n`
  );
}

function testSummary({ passed, failed, warned }) {
  console.log("");
  if (failed > 0) {
    error(`tests finished: ${failed} failed, ${passed} passed`, { warned });
  } else {
    ok(`tests finished: ${passed} passed`, warned > 0 ? { warned } : undefined);
  }
}

module.exports = {
  C,
  TAG,
  isRailway,
  shouldRunBootTest,
  info,
  ok,
  warn,
  error,
  skip,
  enrichStart,
  enrichDone,
  enrichTimeout,
  enrichError,
  agentRun,
  agentDone,
  testPass,
  testFail,
  testWarn,
  testBanner,
  testSummary,
};
