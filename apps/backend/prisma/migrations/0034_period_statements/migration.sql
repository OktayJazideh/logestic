-- INVOICE-DRAFT-1: period statements (draft → review → lock)

CREATE TYPE "PeriodStatementStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'LOCKED');

CREATE TABLE "period_statements" (
    "id" BIGSERIAL NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "cooperative_id" BIGINT NOT NULL,
    "period_key" VARCHAR(7) NOT NULL,
    "status" "PeriodStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "service_count" INTEGER NOT NULL DEFAULT 0,
    "total_tons" DECIMAL(12,3),
    "operational_rial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "community_rial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "deductions_rial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payable_rial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cooperative_payable_iban" TEXT,
    "rejection_reason" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by_user_id" BIGINT,
    "settlement_batch_id" BIGINT,
    "created_by_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_statement_lines" (
    "id" BIGSERIAL NOT NULL,
    "period_statement_id" BIGINT NOT NULL,
    "mission_id" BIGINT NOT NULL,
    "operational_rial" DECIMAL(15,2) NOT NULL,
    "community_rial" DECIMAL(15,2) NOT NULL,
    "verified_net_tons" DECIMAL(12,3),
    "load_tracking_code" TEXT,

    CONSTRAINT "period_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_statement_approvals" (
    "id" BIGSERIAL NOT NULL,
    "period_statement_id" BIGINT NOT NULL,
    "approver_role" VARCHAR(32) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_statement_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "period_statements_mine_id_cooperative_id_period_key_key" ON "period_statements"("mine_id", "cooperative_id", "period_key");
CREATE INDEX "period_statements_mine_id_period_key_idx" ON "period_statements"("mine_id", "period_key");
CREATE INDEX "period_statements_status_idx" ON "period_statements"("status");

CREATE UNIQUE INDEX "period_statement_lines_mission_id_key" ON "period_statement_lines"("mission_id");
CREATE INDEX "period_statement_lines_period_statement_id_idx" ON "period_statement_lines"("period_statement_id");

CREATE UNIQUE INDEX "period_statement_approvals_period_statement_id_approver_role_key" ON "period_statement_approvals"("period_statement_id", "approver_role");

ALTER TABLE "period_statements" ADD CONSTRAINT "period_statements_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_statements" ADD CONSTRAINT "period_statements_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "period_statement_lines" ADD CONSTRAINT "period_statement_lines_period_statement_id_fkey" FOREIGN KEY ("period_statement_id") REFERENCES "period_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_statement_lines" ADD CONSTRAINT "period_statement_lines_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "period_statement_approvals" ADD CONSTRAINT "period_statement_approvals_period_statement_id_fkey" FOREIGN KEY ("period_statement_id") REFERENCES "period_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
