-- TENANT-1: user workspace memberships (mine + optional cooperative scope)
CREATE TYPE "WorkspaceMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TABLE "user_workspace_memberships" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "cooperative_id" BIGINT,
    "role_in_workspace" "UserRole" NOT NULL,
    "status" "WorkspaceMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_workspace_memberships_user_mine_coop_key"
    ON "user_workspace_memberships" ("user_id", "mine_id", COALESCE("cooperative_id", 0));

CREATE INDEX "user_workspace_memberships_user_id_status_idx"
    ON "user_workspace_memberships" ("user_id", "status");

CREATE INDEX "user_workspace_memberships_mine_id_idx"
    ON "user_workspace_memberships" ("mine_id");

ALTER TABLE "user_workspace_memberships"
    ADD CONSTRAINT "user_workspace_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_workspace_memberships"
    ADD CONSTRAINT "user_workspace_memberships_mine_id_fkey"
    FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_workspace_memberships"
    ADD CONSTRAINT "user_workspace_memberships_cooperative_id_fkey"
    FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
