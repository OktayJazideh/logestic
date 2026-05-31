-- KPI-1: daily operational KPI snapshots per mine
CREATE TABLE "kpi_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "mine_id" BIGINT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kpi_snapshots_snapshot_date_mine_id_key_key" ON "kpi_snapshots"("snapshot_date", "mine_id", "key");
CREATE INDEX "kpi_snapshots_snapshot_date_idx" ON "kpi_snapshots"("snapshot_date");
CREATE INDEX "kpi_snapshots_mine_id_idx" ON "kpi_snapshots"("mine_id");

ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
