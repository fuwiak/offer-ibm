ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "inboxKind" TEXT NOT NULL DEFAULT 'lead';
ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "orderReference" TEXT;
ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "orderStatus" TEXT;
ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "orderPartner" TEXT;
ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "orderTotal" TEXT;
ALTER TABLE "lawyerRevizorro_inbound_leads" ADD COLUMN "orderEta" TEXT;

CREATE INDEX "lawyerRevizorro_inbound_leads_inboxKind_idx" ON "lawyerRevizorro_inbound_leads"("inboxKind");
