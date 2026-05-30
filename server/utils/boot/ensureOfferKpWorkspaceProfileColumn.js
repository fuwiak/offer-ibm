const prisma = require("../prisma");

function hasSqliteColumn(columns, name) {
  return columns.some((col) => col?.name === name);
}

async function ensureOfferKpWorkspaceProfileColumn() {
  try {
    const sqliteColumns = await prisma.$queryRawUnsafe(
      `PRAGMA table_info("workspaces");`
    );

    if (!Array.isArray(sqliteColumns) || sqliteColumns.length === 0) {
      return;
    }

    const hasProfileColumn = hasSqliteColumn(
      sqliteColumns,
      "offerKpUserProfile"
    );
    if (hasProfileColumn) return;

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "workspaces" ADD COLUMN "offerKpUserProfile" TEXT;`
    );

    const hasAveliaColumn = hasSqliteColumn(sqliteColumns, "aveliaUserProfile");
    if (hasAveliaColumn) {
      await prisma.$executeRawUnsafe(
        `UPDATE "workspaces"
         SET "offerKpUserProfile" = "aveliaUserProfile"
         WHERE "offerKpUserProfile" IS NULL
           AND "aveliaUserProfile" IS NOT NULL;`
      );
    }

    console.log(
      '[DB PATCH] Added missing "workspaces.offerKpUserProfile" column.'
    );
  } catch (error) {
    console.error(
      '[DB PATCH] Failed to ensure "workspaces.offerKpUserProfile":',
      error?.message || error
    );
  }
}

module.exports = { ensureOfferKpWorkspaceProfileColumn };
