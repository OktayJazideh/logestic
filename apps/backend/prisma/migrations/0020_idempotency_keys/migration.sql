-- IDEM-1: idempotency keys for sensitive POST endpoints (24h TTL enforced in app).

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id             BIGSERIAL PRIMARY KEY,
  key            VARCHAR(64) NOT NULL,
  route          VARCHAR(512) NOT NULL,
  request_hash   VARCHAR(64) NOT NULL,
  response_body  JSONB,
  status_code    INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT idempotency_keys_key_route_unique UNIQUE (key, route)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys(created_at);
