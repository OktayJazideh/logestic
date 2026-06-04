/**
 * PILOT-TAFTAN-1: post-seed assertions + 10-step UAT flow (3×).
 * Run: npm run test:pilot-taftan1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { toBig, toNum } from "../src/repositories/id";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";
import * as serviceContractsRepo from "../src/repositories/serviceContractsRepository";
import { computeCommunityContribution } from "../src/repositories/financeLedgerRepository";
import { ACTIVE_MISSION_STATUSES } from "../src/lib/missionFsm";
import { closeTestHttpServer, ensureTestHttpServer } from "./lib/testHttpServer";
import {
  TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT,
  TAFTAN_MINE_CODE,
} from "./seedConstants";

const QTY_TONS = 10;
const DRIVER_MOBILE = "09000000003";
const COOP_IBAN = "IR820540102680020817909002";

let BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { status: res.status, text, json: null as unknown as Record<string, unknown> };
  }
  return { status: res.status, text, json };
}

async function loginAs(mobile: string) {
  await http("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ mobile_number: mobile }) });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = (devOtp.json?.data as { otp?: string })?.otp;
  if (!code) throw new Error(`dev otp missing for ${mobile}`);
  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify failed for ${mobile}`);
  }
  return (verify.json.data as { access_token: string }).access_token;
}

async function selectWorkspace(
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  return http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mine_id: mineId,
      cooperative_id: opts?.cooperativeId,
      membership_kind: opts?.membership_kind ?? "OPERATIONAL",
    }),
  });
}

async function pollJob(jobId: string, token: string) {
  for (let i = 0; i < 150; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200 || !r.json.success) throw new Error(`poll ${jobId}: ${JSON.stringify(r.json)}`);
    const job = (r.json.data as { job: { status: string; error?: string; result?: unknown } }).job;
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(typeof job.error === "string" ? job.error : JSON.stringify(job.error ?? "job_failed"));
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`poll timeout ${jobId}`);
}

async function assertPostSeedDb() {
  const mine = await prisma.mines.findFirst({ where: { mine_code: TAFTAN_MINE_CODE } });
  assert(mine != null, `mine ${TAFTAN_MINE_CODE} missing after seed`);
  const mineId = toNum(mine.id);

  const contract = await serviceContractsRepo.findActiveServiceContract({
    mine_id: mineId,
    cooperative_id: 1,
    operation_type_code: "HAUL_TONNAGE",
  });
  assert(contract != null, "ACTIVE HAUL_TONNAGE service_contract missing");
  assert(contract.status === "ACTIVE", `contract status expected ACTIVE, got ${contract.status}`);
  assert(
    contract.fixed_community_amount_rial_per_unit === TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT,
    `fixed_community expected ${TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT}, got ${contract.fixed_community_amount_rial_per_unit}`,
  );

  const driverUser = await prisma.users.findFirst({ where: { mobile_number: DRIVER_MOBILE } });
  assert(driverUser != null, `driver user ${DRIVER_MOBILE} missing`);
  const driver = await prisma.drivers.findUnique({ where: { user_id: driverUser.id } });
  assert(driver?.status === "APPROVED", `driver KYC expected APPROVED, got ${driver?.status ?? "missing"}`);

  const fleetOwner = await prisma.fleet_owners.findFirst({
    where: { cooperative_id: toBig(1), status: "APPROVED" },
  });
  assert(fleetOwner != null, "APPROVED fleet owner missing for coop 1");
  const vehicle = await prisma.vehicles.findFirst({
    where: { cooperative_id: toBig(1), status: "APPROVED" },
  });
  assert(vehicle != null, "APPROVED vehicle missing for coop 1");

  const coop = await prisma.cooperatives.findUnique({ where: { id: toBig(1) } });
  assert(coop?.iban === COOP_IBAN, "coop IBAN not seeded");

  // eslint-disable-next-line no-console
  console.log("post-seed DB OK:", {
    mine: TAFTAN_MINE_CODE,
    contract_id: contract.id,
    driver_id: driver ? toNum(driver.id) : null,
    fixed_community: contract.fixed_community_amount_rial_per_unit,
  });

  return { mineId, contract };
}

async function cleanupPeriod(mineId: number) {
  const loads = await prisma.loads.findMany({
    where: { mine_id: BigInt(mineId) },
    select: { id: true },
  });
  if (loads.length > 0) {
    await prisma.missions.updateMany({
      where: {
        load_id: { in: loads.map((l) => l.id) },
        status: { in: ACTIVE_MISSION_STATUSES },
      },
      data: { status: "VERIFIED", verified_at: new Date() },
    });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const period_key = `${year}-${String(month).padStart(2, "0")}`;

  const batches = await prisma.settlement_batches.findMany({
    where: { mine_id: BigInt(mineId), period_start: periodStart },
    select: { id: true },
  });
  for (const b of batches) {
    await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
    await prisma.settlement_lines.deleteMany({ where: { batch_id: b.id } });
  }
  await prisma.settlement_batches.deleteMany({
    where: { mine_id: BigInt(mineId), period_start: periodStart },
  });

  const statements = await prisma.period_statements.findMany({
    where: { mine_id: BigInt(mineId), period_key },
  });
  for (const row of statements) {
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
}

async function runOnce(run: number, mineId: number, contractFixedRial: number) {
  await cleanupPeriod(mineId);

  const adminToken = await loginAs("09000000000");
  const employerToken = await loginAs("09000000007");
  const opsToken = await loginAs("09000000002");
  const coopAdminToken = await loginAs("09000000001");
  const opLockerToken = await loginAs("09000000103");
  const coopOpToken = await loginAs("09000000111");

  // Step 2: workspace select
  await selectWorkspace(employerToken, mineId);
  await selectWorkspace(opsToken, mineId);
  await selectWorkspace(coopAdminToken, mineId, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  await selectWorkspace(opLockerToken, mineId);

  // Step 3: employer need
  const needRes = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      village_id: 1,
      material_type: "ORE",
      quantity_tons: QTY_TONS,
      note: `pilot-taftan run ${run}`,
    }),
  });
  assert(needRes.status === 201 && needRes.json.success, `run ${run}: need ${JSON.stringify(needRes.json)}`);
  const needId = (needRes.json.data as { need: { id: number } }).need.id;

  // Step 4: dispatch (no __dev/seed/demo)
  const dispatch = await http(`/api/admin/needs/${needId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({}),
  });
  assert(dispatch.status === 200 && dispatch.json.success, `run ${run}: dispatch ${JSON.stringify(dispatch.json)}`);
  const firstAssignment = (dispatch.json.data as { assignments: { mission_id: number; driver_id: number }[] })
    .assignments[0]!;
  const missionId = firstAssignment.mission_id;

  const driverRow = await prisma.drivers.findUnique({
    where: { id: BigInt(firstAssignment.driver_id) },
    include: { user: true },
  });
  assert(driverRow?.user?.mobile_number, `run ${run}: driver mobile`);
  const coopId = driverRow.cooperative_id != null ? toNum(driverRow.cooperative_id) : 1;
  await workspaceRepo.upsertMembership({
    user_id: toNum(driverRow.user_id),
    mine_id: mineId,
    cooperative_id: coopId,
    role_in_workspace: "DRIVER",
    status: "ACTIVE",
  });
  const driverToken = await loginAs(driverRow.user.mobile_number);
  await selectWorkspace(driverToken, mineId, { cooperativeId: coopId });

  // Step 5: driver FSM
  for (const step of ["ACCEPTED", "ARRIVED"] as const) {
    const body = step === "ARRIVED" ? { step, latitude: 27, longitude: 55 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    assert(r.status === 200 && r.json.success, `run ${run}: ${step}`);
  }

  const ticketRes = await http(`/api/driver/missions/${missionId}/ticket`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const ticketId = (ticketRes.json?.data as { ticket?: { id: number } })?.ticket?.id;
  assert(!!ticketId, `run ${run}: ticket`);

  // Step 6: weighbridge → VERIFIED
  await selectWorkspace(coopOpToken, mineId, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const loadedKg = 10000 + QTY_TONS * 1000;
  const weights = await http(`/api/weighbridge/tickets/${ticketId}/weights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopOpToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ empty_weight: 10000, loaded_weight: loadedKg }),
  });
  assert(weights.status === 200 && weights.json.success, `run ${run}: weights`);

  for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
    const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
    const r = await http(`/api/driver/missions/${missionId}/steps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    assert(r.status === 200 && r.json.success, `run ${run}: ${step}`);
  }

  await selectWorkspace(opsToken, mineId, { membership_kind: "OPERATIONAL" });
  const approve = await http(`/api/weighbridge/tickets/${ticketId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
  });
  assert(approve.status === 200 && approve.json.success, `run ${run}: approve ${JSON.stringify(approve.json)}`);
  assert(
    (approve.json.data as { mission: { status: string } }).mission.status === "VERIFIED",
    `run ${run}: VERIFIED`,
  );

  // Step 7: assert 99/1 + community from contract
  const finance = (approve.json.data as {
    finance: {
      totalFare: number;
      ownerAmount: number;
      platformAmount: number;
      communityAmount: number;
    };
  }).finance;
  const tolerance = 0.05;
  assert(Math.abs(finance.ownerAmount - finance.totalFare * 0.99) < tolerance, `run ${run}: owner 99% split`);
  assert(Math.abs(finance.platformAmount - finance.totalFare * 0.01) < tolerance, `run ${run}: platform 1% split`);
  assert(
    Math.abs(finance.ownerAmount + finance.platformAmount - finance.totalFare) < tolerance,
    `run ${run}: operational split sum`,
  );

  const expectedCommunity = QTY_TONS * contractFixedRial;
  assert(
    Math.abs(finance.communityAmount - expectedCommunity) < tolerance,
    `run ${run}: community expected ${expectedCommunity} (tons×contract), got ${finance.communityAmount}`,
  );

  const contractCommunity = await computeCommunityContribution(loadedKg - 10000, {
    mineId,
    cooperativeId: 1,
    at: new Date(),
  });
  assert(
    Math.abs(contractCommunity - expectedCommunity) < tolerance,
    `run ${run}: computeCommunityContribution must use service_contract`,
  );
  const defaultCoopCommunity = await computeCommunityContribution(loadedKg - 10000, {
    mineId,
    at: new Date(),
  });
  assert(
    Math.abs(defaultCoopCommunity - contractCommunity) < tolerance,
    `run ${run}: default cooperative contract path must match explicit cooperativeId`,
  );

  // Step 8: monthly-close → period_statement
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const close = await http("/api/admin/settlement/monthly-close", {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ mine_id: mineId, year, month }),
  });
  assert([200, 202].includes(close.status) && close.json.success, `run ${run}: close`);

  let batchId: number;
  let statementId: number | undefined;
  if (close.status === 202) {
    const job = await pollJob((close.json.data as { job_id: string }).job_id, opsToken);
    const result = job.result as {
      ok: boolean;
      batch: { id: number };
      period_statements?: Array<{ id: number }>;
    };
    assert(result.ok, `run ${run}: close job`);
    batchId = result.batch.id;
    statementId = result.period_statements?.[0]?.id;
  } else {
    batchId = (close.json.data as { batch: { id: number } }).batch.id;
  }

  if (!statementId) {
    const ps = await http(
      `/api/admin/finance/period-statements?mine_id=${mineId}&cooperative_id=1&year=${year}&month=${month}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    statementId = (ps.json.data as { statements: Array<{ id: number }> }).statements[0]?.id;
  }
  assert(statementId != null && statementId > 0, `run ${run}: period statement missing`);

  // Step 9: period_statement submit → approve → lock
  const submit = await http(`/api/admin/finance/period-statements/${statementId}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit.status === 200, `run ${run}: submit-review`);

  await selectWorkspace(coopAdminToken, mineId, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  const coopApprove = await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  assert(coopApprove.status === 200, `run ${run}: coop period statement approve`);

  await selectWorkspace(opsToken, mineId);
  const mineApprove = await http(`/api/admin/finance/period-statements/${statementId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  assert(mineApprove.status === 200, `run ${run}: period statement approve`);

  const lockPs = await http(`/api/admin/finance/period-statements/${statementId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(lockPs.status === 200, `run ${run}: period statement lock`);

  // Step 10: settlement approve → mine payment → lock
  await selectWorkspace(coopAdminToken, mineId, { cooperativeId: 1, membership_kind: "COMMUNITY" });
  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${coopAdminToken}` },
  });
  await selectWorkspace(opsToken, mineId);
  await http(`/api/admin/settlement/${batchId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opsToken}` },
  });

  const lockBatchEarly = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(
    lockBatchEarly.status === 409 &&
      (lockBatchEarly.json?.error as { code?: string })?.code === "mine_payment_required",
    `run ${run}: lock without mine payment must be mine_payment_required`,
  );

  const minePay = await http(`/api/admin/finance/period-statements/${statementId}/register-mine-payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ payment_reference: `TAFTANREF${run}00000001` }),
  });
  assert(minePay.status === 200, `run ${run}: register mine payment`);

  const lockBatch = await http(`/api/admin/settlement/${batchId}/lock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opLockerToken}` },
  });
  assert(lockBatch.status === 200, `run ${run}: settlement lock`);

  // eslint-disable-next-line no-console
  console.log(
    `PILOT-TAFTAN-1 run ${run}: OK need=${needId} mission=${missionId} community=${finance.communityAmount} batch=${batchId}`,
  );
}

async function main() {
  const { mineId, contract } = await assertPostSeedDb();
  BASE = await ensureTestHttpServer();

  for (let run = 1; run <= 3; run++) {
    await runOnce(run, mineId, contract.fixed_community_amount_rial_per_unit);
  }

  // eslint-disable-next-line no-console
  console.log("PILOT-TAFTAN-1: all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
