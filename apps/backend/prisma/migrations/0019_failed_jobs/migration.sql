-- QUEUE-1: durable store for jobs that exhausted retries
CREATE TABLE IF NOT EXISTS failed_jobs (
  id BIGSERIAL PRIMARY KEY,
  queue_name VARCHAR(64) NOT NULL,
  job_name VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  attempts INT NOT NULL,
  max_attempts INT NOT NULL DEFAULT 4,
  correlation_id VARCHAR(128),
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retried_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'failed'
);

CREATE INDEX IF NOT EXISTS failed_jobs_queue_status_idx ON failed_jobs (queue_name, status, failed_at DESC);
