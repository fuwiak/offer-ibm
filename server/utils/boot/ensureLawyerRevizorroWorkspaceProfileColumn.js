const prisma = require("../prisma");

function hasSqliteColumn(columns, name) {
  return columns.some((col) => col?.name === name);
}

async function ensureLawyerRevizorroWorkspaceProfileColumn() {
  try {
    const sqliteColumns = await prisma.$queryRawUnsafe(
      `PRAGMA table_info("workspaces");`
    );

    if (!Array.isArray(sqliteColumns) || sqliteColumns.length === 0) {
      return;
    }

    const hasLawyerColumn = hasSqliteColumn(
      sqliteColumns,
      "lawyerRevizorroUserProfile"
    );
    if (hasLawyerColumn) return;

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "workspaces" ADD COLUMN "lawyerRevizorroUserProfile" TEXT;`
    );

    const hasAveliaColumn = hasSqliteColumn(sqliteColumns, "aveliaUserProfile");
    if (hasAveliaColumn) {
      await prisma.$executeRawUnsafe(
        `UPDATE "workspaces"
         SET "lawyerRevizorroUserProfile" = "aveliaUserProfile"
         WHERE "lawyerRevizorroUserProfile" IS NULL
           AND "aveliaUserProfile" IS NOT NULL;`
      );
    }

    console.log(
      '[DB PATCH] Added missing "workspaces.lawyerRevizorroUserProfile" column.'
    );
  } catch (error) {
    console.error(
      '[DB PATCH] Failed to ensure "workspaces.lawyerRevizorroUserProfile":',
      error?.message || error
    );
  }
}

module.exports = { ensureLawyerRevizorroWorkspaceProfileColumn };
