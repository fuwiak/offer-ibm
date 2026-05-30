-- Repair migration: create tables that avelia_phase1 should have created
-- but may not exist on databases where the migration was baselined.
-- All statements use IF NOT EXISTS so this is safe to run multiple times.

CREATE TABLE IF NOT EXISTS "partner_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "country" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "lawyerRevizorro_quotes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "userId" INTEGER,
    "partnerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "shipping" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "previewJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lawyerRevizorro_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lawyerRevizorro_quote_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quoteId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceM2" REAL,
    "surchargeMultiplier" REAL DEFAULT 1,
    "lineTotal" REAL DEFAULT 0,
    CONSTRAINT "lawyerRevizorro_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "lawyerRevizorro_quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lawyerRevizorro_share_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lawyerRevizorro_share_links_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "lawyerRevizorro_quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "lawyerRevizorro_quotes_reference_key" ON "lawyerRevizorro_quotes"("reference");
CREATE INDEX IF NOT EXISTS "lawyerRevizorro_quote_lines_quoteId_idx" ON "lawyerRevizorro_quote_lines"("quoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "lawyerRevizorro_share_links_token_key" ON "lawyerRevizorro_share_links"("token");
CREATE INDEX IF NOT EXISTS "lawyerRevizorro_share_links_quoteId_idx" ON "lawyerRevizorro_share_links"("quoteId");
