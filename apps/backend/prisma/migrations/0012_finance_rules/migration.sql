-- RULE-1: versioned configurable finance rules
CREATE TABLE "finance_rules" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "scope_type" TEXT NOT NULL,
    "mine_id" BIGINT,
    "cooperative_id" BIGINT,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_rules_key_status_idx" ON "finance_rules"("key", "status");
CREATE INDEX "finance_rules_key_scope_idx" ON "finance_rules"("key", "scope_type", "mine_id", "cooperative_id", "status");

ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
