-- SVC-CONTRACT-1: one ACTIVE contract per mine + cooperative + operation (not mine-wide only)

DROP INDEX IF EXISTS "service_contracts_one_active_per_mine_operation";

CREATE UNIQUE INDEX "service_contracts_one_active_per_mine_coop_operation"
  ON "service_contracts" ("mine_id", "cooperative_id", "operation_type_code")
  WHERE status = 'ACTIVE';
