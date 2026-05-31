/**
 * FIN-UI-1 (unit): IBAN mask + checksum — no database.
 * Run 3x: npm run test:fin-iban
 */
import { maskIban, normalizeIban, validateIranIbanChecksum } from "../src/lib/iban";

const VALID = "IR820540102680020817909002";
const INVALID_CHECKSUM = "IR0000000000000000000000";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runOnce(run: number) {
  assert(validateIranIbanChecksum(VALID), `run ${run}: valid iban`);
  assert(!validateIranIbanChecksum(INVALID_CHECKSUM), `run ${run}: invalid checksum`);
  assert(maskIban(VALID) === "IR82 ******** 9002", `run ${run}: mask format`);
  assert(normalizeIban("ir82 0540 1026 8002 0817 9090 02") === VALID, `run ${run}: normalize`);
  // eslint-disable-next-line no-console
  console.log(`FIN-IBAN run ${run} OK`);
}

for (let run = 1; run <= 3; run++) {
  runOnce(run);
}
// eslint-disable-next-line no-console
console.log("test:fin-iban — 3 runs OK");
