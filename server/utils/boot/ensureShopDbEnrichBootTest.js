const fs = require("fs");
const path = require("path");
const { isShopDbConfigured, query } = require("../offerKp/db/client");
const {
  shopDbEnrichEnabled,
  getShopDbContext,
} = require("../offerKp/enrich");
const shopDbLog = require("../offerKp/shopDbLog");

const BOOT_SAMPLE_QUERY =
  "Штанга DIN 975 M36x2000 4.8 оцинк";

function ensureStorageDirs() {
  const storageDir =
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage");
  for (const sub of ["", "models", "documents", "vector-cache"]) {
    try {
      fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
    } catch {
      /* non-fatal */
    }
  }
}

async function ensureShopDbEnrichBootTest() {
  ensureStorageDirs();

  if (!shopDbLog.shouldRunBootTest()) {
    shopDbLog.skip("boot enrich test disabled", {
      hint: "set SHOP_DB_BOOT_TEST=1 locally or deploy on Railway",
    });
    return;
  }

  shopDbLog.testBanner("boot enrich smoke test");

  if (!shopDbEnrichEnabled()) {
    shopDbLog.warn("boot test skipped", { reason: "SHOP_DB_ENRICH off" });
    return;
  }

  if (!isShopDbConfigured()) {
    shopDbLog.error("boot test failed", {
      reason: "MySQL not configured (DB_HOST / DATABASE_URL)",
    });
    return;
  }

  try {
    const rows = await query(
      "SELECT COUNT(*) AS cnt FROM shop_product WHERE status = 1"
    );
    const active = rows[0]?.cnt ?? 0;
    shopDbLog.ok("MySQL ping", { activeProducts: active });
    if (active === 0) {
      shopDbLog.warn("catalog empty", { table: "shop_product" });
    }
  } catch (e) {
    shopDbLog.error("MySQL ping failed", { error: e.message });
    return;
  }

  const t0 = Date.now();
  try {
    const ctx = await getShopDbContext(BOOT_SAMPLE_QUERY, { maxDocs: 2 });
    const ms = Date.now() - t0;
    const flags = ctx.flags || {};
    const docCount = flags.shopDbDocCount || 0;
    const titles = (ctx.sources || []).map((s) => s.title).filter(Boolean);

    if (flags.shopDbSkipped) {
      shopDbLog.warn("enrich skipped at boot", flags);
      return;
    }
    if (flags.shopDbTimeout) {
      shopDbLog.enrichTimeout({ ms, sample: BOOT_SAMPLE_QUERY });
      return;
    }
    if (flags.shopDbError) {
      shopDbLog.error("enrich error at boot", {
        ms,
        message: flags.shopDbMessage,
      });
      return;
    }
    if (docCount === 0) {
      shopDbLog.error("enrich returned zero products", {
        ms,
        hits: flags.shopDbSearchHitCount,
        strategies: flags.shopDbMatchStrategies,
        sample: BOOT_SAMPLE_QUERY,
      });
      return;
    }

    shopDbLog.ok("boot enrich OK", {
      ms,
      docCount,
      hits: flags.shopDbSearchHitCount,
      tables: flags.shopDbTablesUsed,
      strategies: flags.shopDbMatchStrategies,
      products: titles,
    });
  } catch (e) {
    shopDbLog.error("boot enrich threw", {
      ms: Date.now() - t0,
      error: e.message,
    });
  }
}

module.exports = { ensureShopDbEnrichBootTest, BOOT_SAMPLE_QUERY };
