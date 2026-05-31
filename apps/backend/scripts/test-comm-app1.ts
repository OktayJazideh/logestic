/**
 * COMM-APP-1: API contract for community mobile app (HOUSEHOLD / COOP roles).
 * Run 3x: npm run test:comm-app1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";

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
  return {
    token: verify.json.data.access_token as string,
    role: verify.json.data.role as string,
  };
}

async function runOnce(run: number) {
  await appContext.entities.hydrate();

  const household = await loginAs("09000001001");
  assert(household.role === "HOUSEHOLD", `run ${run}: expected HOUSEHOLD role`);

  const wallet = await http("/api/wallet/household", {
    headers: { Authorization: `Bearer ${household.token}` },
  });
  assert(wallet.status === 200 && wallet.json.success, `run ${run}: household wallet failed`);
  assert(typeof wallet.json.data.balance === "number", `run ${run}: balance missing`);
  assert(Array.isArray(wallet.json.data.transactions), `run ${run}: transactions missing`);
  assert(
    typeof wallet.json.data.community_rial_per_ton === "number" && wallet.json.data.community_rial_per_ton > 0,
    `run ${run}: community_rial_per_ton missing`,
  );

  const membersHh = await http("/api/coop/members", {
    headers: { Authorization: `Bearer ${household.token}` },
  });
  assert(membersHh.status === 200, `run ${run}: household members list failed`);

  const coopAdmin = await loginAs("09000000001");
  assert(coopAdmin.role === "COOP_ADMIN" || coopAdmin.role === "COOP", `run ${run}: coop admin role`);

  const inbox = await http("/api/coop/kyc/inbox", {
    headers: { Authorization: `Bearer ${coopAdmin.token}` },
  });
  assert(inbox.status === 200 && inbox.json.data.items, `run ${run}: kyc inbox failed`);

  const membersCoop = await http("/api/coop/members", {
    headers: { Authorization: `Bearer ${coopAdmin.token}` },
  });
  assert(membersCoop.status === 200, `run ${run}: coop members failed`);

  const objections = await http("/api/coop/objections", {
    headers: { Authorization: `Bearer ${coopAdmin.token}` },
  });
  assert(objections.status === 200, `run ${run}: objections list failed`);

  const coopOp = await loginAs("09000000111");
  assert(coopOp.role === "COOP_OPERATOR", `run ${run}: coop operator role`);

  const inboxOp = await http("/api/coop/kyc/inbox", {
    headers: { Authorization: `Bearer ${coopOp.token}` },
  });
  assert(inboxOp.status === 200, `run ${run}: operator kyc inbox failed`);

  const opObjections = await http("/api/coop/objections", {
    headers: { Authorization: `Bearer ${coopOp.token}` },
  });
  assert(opObjections.status === 403, `run ${run}: operator must not list objections`);

  const driver = await loginAs("09000000003");
  const driverWallet = await http("/api/wallet/household", {
    headers: { Authorization: `Bearer ${driver.token}` },
  });
  assert(driverWallet.status === 403 || driverWallet.status === 404, `run ${run}: driver wallet forbidden`);

  console.log(`run ${run}: COMM-APP-1 API OK`);
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
  console.log("COMM-APP-1: 3/3 passes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
