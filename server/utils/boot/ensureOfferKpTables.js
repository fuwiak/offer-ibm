const fs = require("fs");
const path = require("path");
const prisma = require("../prisma");

const REPAIR_MIGRATION = path.join(
  __dirname,
  "../../prisma/migrations/20260528210000_repair_missing_tables/migration.sql"
);

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureOfferKpTables() {
  try {
    const required = [
      "partner_requests",
      "offerKp_quotes",
      "offerKp_quote_lines",
      "offerKp_share_links",
    ];

    const missing = [];
    for (const table of required) {
      if (!(await tableExists(table))) missing.push(table);
    }
    if (missing.length === 0) return;

    if (!fs.existsSync(REPAIR_MIGRATION)) {
      console.error(
        `[DB PATCH] Missing OfferKP tables (${missing.join(", ")}) but repair SQL not found at ${REPAIR_MIGRATION}`
      );
      return;
    }

    const sql = fs.readFileSync(REPAIR_MIGRATION, "utf8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(`${statement};`);
    }

    console.log(
      `[DB PATCH] Created missing OfferKP tables: ${missing.join(", ")}`
    );
  } catch (error) {
    console.error(
      "[DB PATCH] Failed to ensure OfferKP tables:",
      error?.message || error
    );
  }
}

module.exports = { ensureOfferKpTables };
