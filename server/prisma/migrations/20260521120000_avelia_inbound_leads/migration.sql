-- Inbound leads from IONOS mailbox (lead-transfer@alliaverre.fr)
CREATE TABLE "lawyerRevizorro_inbound_leads" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" TEXT NOT NULL,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "type" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "location" TEXT,
    "isHot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "lawyerRevizorro_inbound_leads_messageId_key" ON "lawyerRevizorro_inbound_leads"("messageId");
CREATE INDEX "lawyerRevizorro_inbound_leads_receivedAt_idx" ON "lawyerRevizorro_inbound_leads"("receivedAt");
CREATE INDEX "lawyerRevizorro_inbound_leads_status_idx" ON "lawyerRevizorro_inbound_leads"("status");
