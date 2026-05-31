/**
 * SOFT-1 unit checks (no DB): entity map, where merge, bypass.
 * Run 3x: npm run test:soft-unit
 */
import {
  ENTITY_TYPE_TO_MODEL,
  mergeDeletedAtFilter,
  resolveSoftDeleteModel,
  runWithSoftDeleteBypass,
  SOFT_DELETE_MODELS,
} from "../src/lib/softDelete";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runOnce(run: number) {
  assert(SOFT_DELETE_MODELS.length === 9, `run ${run}: expected 9 soft-delete models`);

  assert(resolveSoftDeleteModel("rate_card") === "rate_cards", `run ${run}: rate_card map`);
  assert(resolveSoftDeleteModel("USERS") === "users", `run ${run}: users map`);
  assert(resolveSoftDeleteModel("unknown") === null, `run ${run}: unknown type`);

  const filtered = mergeDeletedAtFilter({ id: 1 });
  assert(filtered.deleted_at === null, `run ${run}: default deleted_at filter`);

  const explicit = mergeDeletedAtFilter({ deleted_at: { not: null } });
  assert(
    explicit.deleted_at != null && typeof explicit.deleted_at === "object",
    `run ${run}: explicit deleted_at preserved`,
  );

  await runWithSoftDeleteBypass(async () => {
    const bypassed = mergeDeletedAtFilter({ id: 2 });
    assert(!("deleted_at" in bypassed), `run ${run}: bypass skips filter`);
  });

  for (const model of SOFT_DELETE_MODELS) {
    assert(ENTITY_TYPE_TO_MODEL[model] === model, `run ${run}: plural alias ${model}`);
  }

  console.log(`run ${run}: unit OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test-soft-unit: all 3 runs passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
