-- offer-kp: persist selected bot user profile on workspace (for prompt defaults UI)
ALTER TABLE "workspaces" ADD COLUMN "offerKpUserProfile" TEXT;
