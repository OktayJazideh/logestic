/**
 * CORE-OS-0: operation_types catalog + GET /api/operation-types.
 * Run: npm run test:core-os0
 * Requires: server on TEST_BASE_URL, db:migrate.
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as rateCardsRepo from "../src/repositories/rateCardsRepository";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function loginAs(mobile: string) {
  await http("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ mobile_number: mobile }) });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify failed for ${mobile}: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function selectMine(token: string, mineId: number) {
  const r = await http("/api/mine/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId }),
  });
  assert(r.status === 200 && r.json.success, `mine select failed: ${JSON.stringify(r.json)}`);
}

async function runOnce(run: number) {
  await initAppContext();
  await appContext.mineData.hydrate();

  await appContext.userStore.upsertUserByMobile("09000000007", "EMPLOYER", { is_active: true });

  const employerToken = await loginAs("09000000007");
  await selectMine(employerToken, 1);

  const list = await http("/api/operation-types", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(list.status === 200 && list.json.success, `run ${run}: GET operation-types failed: ${JSON.stringify(list.json)}`);

  const items = list.json.data?.items as Array<{ code: string }> | undefined;
  assert(Array.isArray(items) && items.length >= 2, `run ${run}: expected >= 2 active operation types`);

  const codes = new Set(items!.map((i) => i.code));
  assert(codes.has("HAUL_TONNAGE"), `run ${run}: missing HAUL_TONNAGE`);
  assert(codes.has("HOURLY_EQUIPMENT"), `run ${run}: missing HOURLY_EQUIPMENT`);

  const need = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 5 + run,
    }),
  });
  assert(
    (need.status === 200 || need.status === 201) && need.json.success && need.json.data?.need?.id,
    `run ${run}: legacy employer need failed: ${JSON.stringify(need.json)}`,
  );

  const admin = await appContext.userStore.upsertUserByMobile("09000000000", "ADMIN", { is_active: true });
  const tonCard = await rateCardsRepo.createDraftRateCard({
    mine_id: 1,
    operation_type: "TONNAGE",
    material_type: `CORE_OS0_${run}_${Date.now()}`,
    unit_type: "TON",
    rate: 10000 + run,
    effective_from: new Date("2099-06-01"),
    created_by: admin.id,
  });
  assert(tonCard.operation_type === "TONNAGE", `run ${run}: rate card TONNAGE path broken`);

  // eslint-disable-next-line no-console
  console.log(
    `run ${run} CORE-OS-0 OK — ${items!.length} types, need id=${need.json.data?.need?.id}, rate_card id=${tonCard.id}`,
  );
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("CORE-OS-0 all runs PASS");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  });
