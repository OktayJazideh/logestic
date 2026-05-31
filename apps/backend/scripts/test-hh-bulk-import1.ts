/**
 * HH-BULK-IMPORT-1: cooperative bulk household CSV import.
 * Run 3x: npm run test:hh-bulk-import1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { nationalIdFromSeed } from "../src/lib/nationalId";
import * as householdsRepo from "../src/repositories/householdsRepository";
import { prisma } from "../src/db/prisma";

let testServer: Server | null = null;
let baseUrl = "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ensureTestServer(): Promise<string> {
  if (baseUrl) return baseUrl;
  await initAppContext();
  const app = createApp();
  return new Promise((resolve, reject) => {
    testServer = createServer(app);
    testServer.listen(0, "127.0.0.1", () => {
      const addr = testServer!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind test server"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(baseUrl);
    });
    testServer.on("error", reject);
  });
}

async function http(path: string, init?: RequestInit) {
  const root = await ensureTestServer();
  const res = await fetch(`${root}${path}`, {
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

function csvRow(nationalId: string, name: string, villageCode: string, mobile?: string) {
  const mob = mobile ?? "";
  return `${nationalId},${name},${villageCode},${mob}`;
}

async function selectWorkspace(token: string, mineId: number, membershipKind: "OPERATIONAL" | "COMMUNITY" = "COMMUNITY") {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: membershipKind }),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  const token = await loginAs("09000000001");
  await selectWorkspace(token, 1);

  const base9 = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const nid1 = nationalIdFromSeed(base9);
  const nid2 = nationalIdFromSeed(String((Number(base9) + 1) % 1e9).padStart(9, "0"));
  const nidDup = nid1;
  const mob1 = `09${String(Math.floor(1e9 + Math.random() * 9e8)).slice(-9)}`;

  const csv = [
    "national_id,full_name,village_code,mobile",
    csvRow(nid1, `سرپرست ${run}-۱`, "1", mob1),
    csvRow(nid2, `سرپرست ${run}-۲`, "روستای یک"),
    csvRow(nidDup, `تکراری ${run}`, "1"),
    csvRow("0013542410", `نامعتبر ${run}`, "1"),
  ].join("\n");

  const preview = await http("/api/coop/households/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ csv, dry_run: true }),
  });
  assert(preview.status === 200, `run ${run}: dry_run failed: ${JSON.stringify(preview.json)}`);
  assert(preview.json.data.dry_run === true, `run ${run}: expected dry_run true`);
  assert(preview.json.data.skipped >= 2, `run ${run}: preview should flag invalid/duplicate rows`);

  const imp = await http("/api/coop/households/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ csv }),
  });
  assert(imp.status === 200, `run ${run}: import failed: ${JSON.stringify(imp.json)}`);
  assert(imp.json.data.imported === 2, `run ${run}: expected 2 imported, got ${imp.json.data.imported}`);
  assert(imp.json.data.skipped >= 2, `run ${run}: expected skips for dup+invalid`);

  const h1 = await householdsRepo.findHouseholdByNationalId(nid1);
  const h2 = await householdsRepo.findHouseholdByNationalId(nid2);
  assert(h1?.status === "PENDING", `run ${run}: h1 must be PENDING`);
  assert(h2?.status === "PENDING", `run ${run}: h2 must be PENDING`);

  const auditRow = await prisma.audit_logs.findFirst({
    where: { action: "households.bulk_import", entity_type: "households" },
    orderBy: { id: "desc" },
  });
  assert(auditRow != null, `run ${run}: bulk_import audit missing`);
  const after = auditRow.after_value as { row_count?: number; imported?: number } | null;
  assert(after?.imported === 2, `run ${run}: audit imported mismatch`);
  assert(after?.row_count === 4, `run ${run}: audit row_count mismatch`);

  const imp2 = await http("/api/coop/households/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ csv: `national_id,full_name,village_code,mobile\n${csvRow(nid1, "دوباره", "1")}` }),
  });
  assert(imp2.json.data.imported === 0, `run ${run}: re-import should not import`);
  assert(
    imp2.json.data.errors.some((e: { code: string }) => e.code === "duplicate_national_id"),
    `run ${run}: expected duplicate_national_id`,
  );

  console.log(`run ${run}: OK imported=${imp.json.data.imported} skipped=${imp.json.data.skipped}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test-hh-bulk-import1: all runs passed");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect().finally(() => process.exit(1));
  });
