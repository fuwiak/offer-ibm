const prisma = require("../prisma");

async function configureSqlite() {
  try {
    const mode = await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    console.log("[BOOT] SQLite configured", {
      journalMode: mode?.[0]?.journal_mode || "WAL",
      busyTimeoutMs: 5000,
    });
  } catch (error) {
    // Boot remains available on read-only or non-SQLite test databases.
    console.warn("[BOOT] SQLite performance setup skipped:", error.message);
  }
}

module.exports = { configureSqlite };
