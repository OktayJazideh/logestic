/**
 * FIN-UI-1: admin finance summary, IBAN reveal audit, export.
 * Run 3x: npm run test:fin1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { maskIban, validateIranIbanChecksum } from "../src/lib/iban";
import { toBig } from "../src/repositories/id";

const VALID_IBAN = "IR820540102680020817909002";

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
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    return { status: res.status, json, raw: null as string | null, headers: res.headers };
  }
  const raw = await res.text();
  return { status: res.status, json: null, raw, headers: res.headers };
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

async function seedOwnerIban(run: number) {
  const owner = await prisma.fleet_owners.findFirst({ orderBy: { id: "asc" } });
  assert(owner != null, "fleet_owner seed required");
  await prisma.fleet_owners.update({
    where: { id: owner.id },
    data: { bank_iban: VALID_IBAN },
  });
  return { ownerId: Number(owner.id), run };
}

async function runOnce(run: number) {
  assert(validateIranIbanChecksum(VALID_IBAN), "iban checksum self-test");
  assert(maskIban(VALID_IBAN) === "IR82 ******** 9002", `mask format got ${maskIban(VALID_IBAN)}`);

  const { ownerId } = await seedOwnerIban(run);
  const adminToken = await loginAs("09000000000");
  const driverToken = await loginAs("09000000003");

  const year = 2026;
  const month = 5;

  const forbidden = await http(`/api/admin/finance/summary?year=${year}&month=${month}`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(forbidden.status === 403, `run ${run}: non-admin must get 403`);

  const summaryRes = await http(`/api/admin/finance/summary?year=${year}&month=${month}&mine_id=1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(summaryRes.status === 200 && summaryRes.json?.success, `run ${run}: summary failed`);
  const summary = summaryRes.json.data.summary;
  assert(summary.cards != null, `run ${run}: missing cards`);
  assert(Array.isArray(summary.chart) && summary.chart.length === 3, `run ${run}: chart must be 3 months`);
  const ownerRow = summary.iban_rows.find(
    (r: { entity_type: string; entity_id: number }) =>
      r.entity_type === "fleet_owner" && r.entity_id === ownerId,
  );
  assert(ownerRow != null, `run ${run}: owner iban row missing`);
  assert(ownerRow.iban_valid === true, `run ${run}: iban should validate`);
  assert(ownerRow.iban_masked.includes("********"), `run ${run}: iban must be masked`);

  const reveal = await http("/api/admin/finance/iban/reveal", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      entity_type: "fleet_owner",
      entity_id: ownerId,
      reason: `test reveal run ${run}`,
    }),
  });
  assert(reveal.status === 200 && reveal.json?.data?.iban === VALID_IBAN, `run ${run}: reveal failed`);

  const audit = await prisma.audit_logs.findFirst({
    where: {
      entity_type: "fleet_owner",
      entity_id: String(ownerId),
      action: "IBAN_REVEALED",
    },
    orderBy: { created_at: "desc" },
  });
  assert(audit != null && audit.reason?.includes(`run ${run}`), `run ${run}: audit log missing`);

  const csvExport = await http(
    `/api/admin/finance/export?year=${year}&month=${month}&mine_id=1&format=excel`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(csvExport.status === 200, `run ${run}: csv export status`);
  assert((csvExport.raw ?? "").includes("\uFEFF"), `run ${run}: csv BOM`);
  assert((csvExport.raw ?? "").includes("سهم مالکان"), `run ${run}: csv content`);

  const pdfExport = await http(
    `/api/admin/finance/export?year=${year}&month=${month}&format=pdf`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(pdfExport.status === 200, `run ${run}: pdf export status`);
  assert(pdfExport.headers.get("content-type")?.includes("pdf"), `run ${run}: pdf content-type`);

  // eslint-disable-next-line no-console
  console.log(`FIN-1 run ${run} OK`, {
    owner_share: summary.cards.owner_share,
    verified: summary.cards.verified_missions_count,
    iban_rows: summary.iban_rows.length,
  });
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  // eslint-disable-next-line no-console
  console.log("test:fin1 — 3 runs OK");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
    }
    await prisma.$disconnect();
  });
