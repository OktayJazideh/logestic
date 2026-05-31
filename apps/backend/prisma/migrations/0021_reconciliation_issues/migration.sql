-- RECON-1: durable reconciliation issues from nightly wallet/settlement/pool checks
CREATE TYPE "ReconciliationIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id BIGSERIAL PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  status "ReconciliationIssueStatus" NOT NULL DEFAULT 'OPEN',
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id BIGINT,
  resolve_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reconciliation_issues_status_created_idx
  ON reconciliation_issues (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_issues_run_id_idx
  ON reconciliation_issues (run_id);
CREATE INDEX IF NOT EXISTS reconciliation_issues_entity_idx
  ON reconciliation_issues (code, entity_type, entity_id);
