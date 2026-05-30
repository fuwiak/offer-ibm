#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
for (const sub of ["", "models", "documents", "vector-cache"]) {
  fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
}

const { isShopDbConfigured, query } = require("../server/utils/offerKp/db/client");
const enrich = require("../server/utils/offerKp/enrich");
const agent = require("../server/utils/offerKp/searchAgent");
const shopDbLog = require("../server/utils/offerKp/shopDbLog");
const {
  resolveOpenRouterApiKey,
} = require("../server/utils/lawyerRevizorro/openRouterEnv");

const SAMPLE_QUERY = "Штанга DIN 975 M36x2000 4.8 оцинк";
const SAMPLE_QUERY_FALLBACK = "болт DIN 933 M12";

const results = [];

function ok(name, detail = "") {
  results.push({ ok: true, name, detail });
  shopDbLog.testPass(name, detail);
}

function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  shopDbLog.testFail(name, detail);
}

function warn(name, detail = "") {
  results.push({ ok: true, name, detail, warn: true });
  shopDbLog.testWarn(name, detail);
}

(async () => {
  shopDbLog.testBanner("OfferKP DB enrich verification");

  if (process.env.LLM_PROVIDER === "openrouter") ok("LLM_PROVIDER", "openrouter");
  else fail("LLM_PROVIDER", process.env.LLM_PROVIDER || "(unset)");

  if (process.env.OPENROUTER_MODEL_PREF) {
    ok("OPENROUTER_MODEL_PREF", process.env.OPENROUTER_MODEL_PREF);
  } else {
    fail("OPENROUTER_MODEL_PREF", "(unset)");
  }

  if (resolveOpenRouterApiKey()) ok("OPENROUTER_API_KEY", "set");
  else warn("OPENROUTER_API_KEY", "missing — LLM search agent fallback disabled");

  const shopEnrichFlag = (process.env.SHOP_DB_ENRICH || "").trim();
  if (["1", "true", "yes", "on"].includes(shopEnrichFlag.toLowerCase())) {
    ok("SHOP_DB_ENRICH", shopEnrichFlag);
  } else {
    fail("SHOP_DB_ENRICH", shopEnrichFlag || "(unset)");
  }

  if (agent.shopDbSearchAgentEnabled()) ok("SHOP_DB_SEARCH_AGENT", "enabled");
  else warn("SHOP_DB_SEARCH_AGENT", "disabled");

  if (agent.shopDbSearchAgentLlmEnabled()) {
    ok("SHOP_DB_SEARCH_AGENT_LLM", "enabled");
  } else {
    warn("SHOP_DB_SEARCH_AGENT_LLM", "disabled");
  }

  if (isShopDbConfigured()) {
    ok("MySQL config", "DB_HOST or DATABASE_URL present");
  } else {
    fail(
      "MySQL config",
      "set DB_* in server/.env, repo root .env, server/.env.railway, or Railway Variables"
    );
    printSummary();
    process.exit(1);
  }

  if (enrich.shopDbEnrichEnabled()) ok("shopDbEnrichEnabled()", "true");
  else fail("shopDbEnrichEnabled()", "false despite SHOP_DB_ENRICH=1");

  try {
    const rows = await query(
      "SELECT COUNT(*) AS cnt FROM shop_product WHERE status = 1"
    );
    ok("MySQL connection", `${rows[0]?.cnt ?? 0} active products`);
  } catch (e) {
    fail("MySQL connection", e.message);
    printSummary();
    process.exit(1);
  }

  await runEnrichTest(SAMPLE_QUERY, "primary enrich");

  if (results.some((r) => r.name === "primary enrich" && !r.ok)) {
    await runEnrichTest(SAMPLE_QUERY_FALLBACK, "fallback enrich query");
  }

  if (agent.shopDbSearchAgentEnabled()) {
    await runSearchAgentTest();
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => {
  shopDbLog.error("verify script crashed", { error: e.message, stack: e.stack });
  process.exit(1);
});

async function runEnrichTest(message, testName) {
  const t0 = Date.now();
  try {
    const ctx = await enrich.getShopDbContext(message, { maxDocs: 2 });
    const ms = Date.now() - t0;
    const flags = ctx.flags || {};
    const count = flags.shopDbDocCount || 0;
    const titles = (ctx.sources || []).map((s) => s.title).join(" | ");

    if (flags.shopDbTimeout) {
      fail(testName, `timeout after ${ms}ms`);
      return;
    }
    if (flags.shopDbError) {
      fail(testName, flags.shopDbMessage || "shopDbError");
      return;
    }
    if (count > 0) {
      ok(testName, `${count} block(s) in ${ms}ms — ${titles}`);
      shopDbLog.info("enrich flags", {
        hits: flags.shopDbSearchHitCount,
        tables: flags.shopDbTablesUsed,
        strategies: flags.shopDbMatchStrategies,
      });
    } else {
      fail(testName, `0 products in ${ms}ms (hits=${flags.shopDbSearchHitCount ?? 0})`);
    }
  } catch (e) {
    fail(testName, e.message);
  }
}

async function runSearchAgentTest() {
  const parsed = agent.parseExtendedHardwareQuery(SAMPLE_QUERY);
  const needs = agent.needsSearchAgentFallback([], SAMPLE_QUERY, parsed);
  ok("search agent needs fallback", needs ? "yes for empty hits" : "no");

  try {
    const { products, strategies } = await agent.runShopDbSearchAgent({
      searchText: SAMPLE_QUERY,
      parsed,
      existingProducts: [],
      limit: 3,
    });
    if (products.length > 0) {
      ok(
        "search agent run",
        `${products.length} products, strategies: ${(strategies || []).join(", ") || "—"}`
      );
    } else {
      warn("search agent run", "0 products (regex/LLM miss)");
    }
  } catch (e) {
    fail("search agent run", e.message);
  }
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.warn);
  const passed = results.filter((r) => r.ok && !r.warn).length;
  shopDbLog.testSummary({
    passed,
    failed: failed.length,
    warned: warned.length,
  });
  if (failed.length) {
    console.log("Failed checks:");
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
  }
}
