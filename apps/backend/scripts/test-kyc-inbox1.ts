/**
 * WF-COOP-KYC-WF-1: paginated/filterable KYC inbox API.
 * Run 3x: npm run test:kyc-inbox1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import * as workspaceRepo from "../src/repositories/workspaceMembershipsRepository";

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

async function ensureCoopOperator() {
  const mobile = "09000000111";
  const user = await appContext.userStore.upsertUserByMobile(mobile, "COOP_OPERATOR", {
    is_active: true,
    cooperative_id: 1,
  });
  await workspaceRepo.upsertMembership({
    user_id: user.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "COOP_OPERATOR",
  });
}

async function createHousehold(villageId: number, run: number, tag: string) {
  const unique = `${Date.now()}${run}${tag}${Math.floor(Math.random() * 1e4)}`;
  const digits = unique.replace(/\D/g, "").slice(-7);
  const mobile = `0903${String(villageId)}${digits}`.slice(0, 11);
  await appContext.userStore.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
  const token = await loginAs(mobile);
  const req = await http("/api/coop/households/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      cooperative_id: 1,
      village_id: villageId,
      head_name: `Inbox ${unique}`,
      national_id: `inbox-${unique.replace(/\D/g, "").slice(-12)}`,
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(req.status === 201, `household request failed: ${JSON.stringify(req.json)}`);
  return req.json.data.household as { id: number };
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();
  await ensureCoopOperator();
  const operatorToken = await loginAs("09000000111");

  await createHousehold(1, run, "a");
  await createHousehold(2, run, "b");

  const all = await http("/api/coop/kyc/inbox?status=PENDING&limit=100", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(all.status === 200, `inbox failed: ${JSON.stringify(all.json)}`);
  assert(Array.isArray(all.json.data.items), "items array expected");
  assert(typeof all.json.data.total === "number", "total expected");
  assert(all.json.data.page === 1, "page expected");
  assert(all.json.data.limit === 100, "limit expected");

  const v1 = await http("/api/coop/kyc/inbox?status=PENDING&village_id=1&limit=100", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(v1.status === 200, "village filter failed");
  assert(v1.json.data.total < all.json.data.total, "village filter should reduce total");
  assert(
    (v1.json.data.items as Array<{ village_id: number | null }>).every((i) => i.village_id === 1),
    "all filtered rows must be village 1",
  );

  const hhOnly = await http("/api/coop/kyc/inbox?status=PENDING&entity_type=household&limit=5&page=1", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(hhOnly.status === 200, "entity_type filter failed");
  assert(
    (hhOnly.json.data.items as Array<{ entity_type: string }>).every((i) => i.entity_type === "household"),
    "entity_type household only",
  );

  const sorted = await http("/api/coop/kyc/inbox?status=PENDING&sort=name:asc&limit=100", {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert(sorted.status === 200, "sort failed");
  const names = (sorted.json.data.items as Array<{ name: string }>).map((i) => i.name);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b, "fa"));
  assert(JSON.stringify(names) === JSON.stringify(sortedNames), "name:asc sort mismatch");

  console.log(`run ${run}: KYC inbox paginated API OK`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => (err ? reject(err) : resolve()));
    });
  }
  console.log("KYC-INBOX-1: 3/3 passes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
