-- GOV-WORKFLOW-1: dual settlement approval + approval_tasks SLA stub

CREATE TYPE "ApprovalTaskStatus" AS ENUM ('PENDING', 'DONE', 'ESCALATED');

CREATE TABLE "approval_tasks" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "required_role" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "escalated_to" TEXT,
    "status" "ApprovalTaskStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_tasks_entity_type_entity_id_idx" ON "approval_tasks"("entity_type", "entity_id");
CREATE INDEX "approval_tasks_status_due_at_idx" ON "approval_tasks"("status", "due_at");

CREATE TABLE "settlement_batch_approvals" (
    "id" BIGSERIAL NOT NULL,
    "settlement_batch_id" BIGINT NOT NULL,
    "approver_role" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_batch_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_batch_approvals_settlement_batch_id_approver_role_key" ON "settlement_batch_approvals"("settlement_batch_id", "approver_role");
CREATE INDEX "settlement_batch_approvals_settlement_batch_id_idx" ON "settlement_batch_approvals"("settlement_batch_id");

ALTER TABLE "settlement_batch_approvals" ADD CONSTRAINT "settlement_batch_approvals_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
