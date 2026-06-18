-- OfferKP: лог правок оператора для дообучения

CREATE TABLE IF NOT EXISTS "offerKp_line_corrections" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "threadSlug" TEXT,
    "quoteReference" TEXT,
    "lineIndex" INTEGER,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "aiSuggestion" TEXT,
    "inquiryRaw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offerKp_line_corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "offerKp_line_corrections_userId_idx" ON "offerKp_line_corrections"("userId");
CREATE INDEX IF NOT EXISTS "offerKp_line_corrections_threadSlug_idx" ON "offerKp_line_corrections"("threadSlug");
CREATE INDEX IF NOT EXISTS "offerKp_line_corrections_createdAt_idx" ON "offerKp_line_corrections"("createdAt");
