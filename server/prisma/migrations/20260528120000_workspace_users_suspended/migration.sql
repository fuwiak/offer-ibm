-- Per-workspace membership suspend (user can stay active in other workspaces)
ALTER TABLE "workspace_users" ADD COLUMN "suspended" INTEGER NOT NULL DEFAULT 0;
