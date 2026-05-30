#!/usr/bin/env node
"use strict";

const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const { isShopDbConfigured, query } = require("../server/utils/offerKp/db/client");
const enrich = require("../server/utils/offerKp/enrich");
const agent = require("../server/utils/offerKp/searchAgent");
const {
  resolveOpenRouterApiKey,
} = require("../server/utils/lawyerRevizorro/openRouterEnv");

const results = [];

function ok(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

function warn(name, detail = "") {
  results.push({ ok: true, name, detail, warn: true });
  console.log(`! ${name}${detail ? `: ${detail}` : ""}`);
}

(async () => {
  console.log("OfferKP env verification\n");

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

  try {
    const ctx = await enrich.getShopDbContext(
      "Штанга DIN 975 M36x2000 4.8 оцинк",
      { maxDocs: 1 }
    );
    const count = ctx.flags?.shopDbDocCount || 0;
    if (count > 0) {
      ok("Catalog enrich", `${count} product block(s)`);
    } else {
      fail("Catalog enrich", "no products returned");
    }
  } catch (e) {
    fail("Catalog enrich", e.message);
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.warn);
  console.log("");
  if (failed.length) {
    console.log(`Failed: ${failed.length}`);
  } else {
    console.log("All required checks passed.");
  }
  if (warned.length) {
    console.log(`Warnings: ${warned.length}`);
  }
}
