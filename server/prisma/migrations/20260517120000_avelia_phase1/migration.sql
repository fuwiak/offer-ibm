-- CreateTable
CREATE TABLE "partner_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "country" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "offerKp_quotes" (
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
    CONSTRAINT "offerKp_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "offerKp_quote_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quoteId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceM2" REAL,
    "surchargeMultiplier" REAL DEFAULT 1,
    "lineTotal" REAL DEFAULT 0,
    CONSTRAINT "offerKp_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "offerKp_quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "offerKp_share_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offerKp_share_links_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "offerKp_quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "offerKp_quotes_reference_key" ON "offerKp_quotes"("reference");

-- CreateIndex
CREATE INDEX "offerKp_quote_lines_quoteId_idx" ON "offerKp_quote_lines"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "offerKp_share_links_token_key" ON "offerKp_share_links"("token");

-- CreateIndex
CREATE INDEX "offerKp_share_links_quoteId_idx" ON "offerKp_share_links"("quoteId");
