/**
 * CORE-OS-1: operation_needs FK + dual-write + list join name_fa.
 * Run: npm run test:core-os1
 * Requires: server on TEST_BASE_URL, db:migrate (0033).
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";

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

  const types = await http("/api/operation-types", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(types.status === 200 && types.json.success, `run ${run}: operation-types failed`);
  const haul = (types.json.data?.items as Array<{ id: string; code: string; name_fa: string }>).find(
    (t) => t.code === "HAUL_TONNAGE",
  );
  assert(!!haul?.id, `run ${run}: HAUL_TONNAGE missing in catalog`);

  const byId = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: `CORE_OS1_ID_${run}`,
      quantity_tons: 10 + run,
      operation_type_id: haul!.id,
    }),
  });
  assert(
    (byId.status === 200 || byId.status === 201) && byId.json.success,
    `run ${run}: create by operation_type_id failed: ${JSON.stringify(byId.json)}`,
  );
  const needById = byId.json.data?.need;
  assert(needById?.operation_type_id === haul!.id, `run ${run}: operation_type_id not stored`);
  assert(needById?.operation_type === "TONNAGE", `run ${run}: legacy operation_type not dual-written`);

  const legacyOnly = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({
      village_id: 1,
      material_type: `CORE_OS1_LEGACY_${run}`,
      quantity_tons: 20 + run,
      operation_type: "TONNAGE",
    }),
  });
  assert(
    (legacyOnly.status === 200 || legacyOnly.status === 201) && legacyOnly.json.success,
    `run ${run}: legacy-only create failed: ${JSON.stringify(legacyOnly.json)}`,
  );
  assert(!!legacyOnly.json.data?.need?.operation_type_id, `run ${run}: legacy path did not resolve catalog id`);

  const list = await http("/api/employer/needs", {
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  assert(list.status === 200 && list.json.success, `run ${run}: list needs failed`);
  const needs = list.json.data?.needs as Array<{ operation_type_name_fa?: string; material_type: string }>;
  const idRow = needs.find((n) => n.material_type === `CORE_OS1_ID_${run}`);
  assert(idRow?.operation_type_name_fa === haul!.name_fa, `run ${run}: name_fa join missing on list`);

  const nullCount = await prisma.operation_needs.count({ where: { operation_type_id: null } });
  assert(nullCount === 0, `run ${run}: backfill incomplete — ${nullCount} needs without operation_type_id`);

  // eslint-disable-next-line no-console
  console.log(
    `run ${run} CORE-OS-1 OK — byId=${needById.id}, legacy=${legacyOnly.json.data?.need?.id}, backfill nulls=0`,
  );
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("CORE-OS-1 all runs PASS");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  });
