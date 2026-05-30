ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "inboxKind" TEXT NOT NULL DEFAULT 'lead';
ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "orderReference" TEXT;
ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "orderStatus" TEXT;
ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "orderPartner" TEXT;
ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "orderTotal" TEXT;
ALTER TABLE "offerKp_inbound_leads" ADD COLUMN "orderEta" TEXT;

CREATE INDEX "offerKp_inbound_leads_inboxKind_idx" ON "offerKp_inbound_leads"("inboxKind");
