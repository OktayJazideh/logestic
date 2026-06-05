/**
 * IDEM-1: idempotency middleware tests.
 * Run 3x: npm run test:idem1
 * Requires: DATABASE_URL, db:migrate, db:seed (starts in-process server if TEST_BASE_URL unset).
 */
import "dotenv/config";
import crypto from "crypto";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";
import { closeTestHttpServer, ensureTestHttpServer } from "./lib/testHttpServer";

let BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

function uuidV4(): string {
  return crypto.randomUUID();
}

async function http(path: string, init?: RequestInit & { idempotencyKey?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }
  const { idempotencyKey: _k, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const json = await res.json();
  return {
    status: res.status,
    json,
    replayed: res.headers.get("Idempotency-Replayed"),
  };
}

/** Idempotency row is persisted on res.finish — poll until replay is ready. */
async function httpIdempotentReplay(
  path: string,
  init: RequestInit & { idempotencyKey: string },
  expectedStatus: number,
) {
  for (let i = 0; i < 40; i++) {
    const res = await http(path, init);
    if (res.replayed === "true" && res.status === expectedStatus) return res;
    if (res.json?.error?.code !== "idempotency_in_progress") return res;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("idempotency replay timeout");
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

function isOk(status: number, json: { success?: boolean }): boolean {
  return status >= 200 && status < 300 && json.success === true;
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

  const body = {
    village_id: 1,
    material_type: "ORE",
    quantity_tons: 20 + run,
  };

  const invalidKey = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify(body),
    idempotencyKey: "not-a-uuid",
  });
  assert(invalidKey.status === 400, `run ${run}: invalid key should be 400`);
  assert(
    invalidKey.json?.error?.code === "invalid_idempotency_key",
    `run ${run}: expected invalid_idempotency_key`,
  );

  const noKey = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ ...body, quantity_tons: 30 + run }),
  });
  assert(isOk(noKey.status, noKey.json), `run ${run}: request without key should succeed (${noKey.status})`);

  const idemKey = uuidV4();
  const first = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify(body),
    idempotencyKey: idemKey,
  });
  assert(isOk(first.status, first.json), `run ${run}: first idempotent create failed (${first.status})`);
  const needId1 = first.json.data?.need?.id as number;

  const second = await httpIdempotentReplay(
    "/api/employer/needs",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify(body),
      idempotencyKey: idemKey,
    },
    first.status,
  );
  assert(isOk(second.status, second.json), `run ${run}: replay should succeed (${second.status})`);
  assert(second.status === first.status, `run ${run}: replay status must match first (${first.status} vs ${second.status})`);
  assert(second.replayed === "true", `run ${run}: Idempotency-Replayed header expected`);
  const needId2 = second.json.data?.need?.id as number;
  assert(needId1 === needId2, `run ${run}: replay must return same need id (${needId1} vs ${needId2})`);

  const mismatch = await http("/api/employer/needs", {
    method: "POST",
    headers: { Authorization: `Bearer ${employerToken}` },
    body: JSON.stringify({ ...body, quantity_tons: body.quantity_tons + 0.5 }),
    idempotencyKey: idemKey,
  });
  assert(mismatch.status === 422, `run ${run}: body mismatch should be 422`);
  assert(
    mismatch.json?.error?.code === "idempotency_key_mismatch",
    `run ${run}: expected idempotency_key_mismatch`,
  );

  const row = await prisma.idempotency_keys.findUnique({
    where: { key_route: { key: idemKey, route: "POST /api/employer/needs" } },
  });
  assert(row != null && row.status_code === first.status, `run ${run}: idempotency row should be stored`);

  // eslint-disable-next-line no-console
  console.log(`IDEM-1 run ${run} OK (need_id=${needId1}, replay ok, mismatch 422)`);
}

async function main() {
  BASE = await ensureTestHttpServer();
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("IDEM-1: all 3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closeTestHttpServer();
    await prisma.$disconnect();
  });
