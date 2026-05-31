/**
 * KYC-REG-1: household self-registration + national_id lock + IBAN audit.
 * Run 3x: npm run test:kyc-reg1
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

async function runOnce(run: number) {
  await appContext.entities.hydrate();

  const unique = `${Date.now()}${run}${Math.floor(Math.random() * 1e6)}`;
  const mobile = `0905${String(run).padStart(2, "0")}${unique.slice(-7)}`;
  await appContext.userStore.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
  await workspaceRepo.upsertMembership({
    user_id: (await appContext.userStore.getByMobile(mobile))!.id,
    mine_id: 1,
    cooperative_id: 1,
    role_in_workspace: "HOUSEHOLD",
  });

  const token = await loginAs(mobile);

  const meBefore = await http("/api/households/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(meBefore.status === 404, `run ${run}: expected 404 before register`);

  await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1 }),
  });

  const register = await http("/api/households/register", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      village_id: 1,
      head_name: `خانوار ${run}`,
      national_id: String(unique).replace(/\D/g, "").slice(-10).padStart(10, "1"),
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(register.status === 201, `run ${run}: register failed: ${JSON.stringify(register.json)}`);
  assert(register.json.data.household.status === "PENDING", `run ${run}: expected PENDING`);
  assert(register.json.data.household.wallet_active === false, `run ${run}: wallet must be locked`);

  const wallet = await http("/api/wallet/household", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(wallet.status === 200, `run ${run}: wallet readable while pending`);
  assert(wallet.json.data.wallet.active === false, `run ${run}: wallet.active must be false`);

  const patchNational = await http("/api/households/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ national_id: "9999999999" }),
  });
  assert(patchNational.status === 403, `run ${run}: national_id patch must be 403`);

  const ibanPatch = await http("/api/households/me/iban", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      bank_iban: "IR820540102680020817909002",
      reason: "تست تغییر شبا KYC-REG-1",
    }),
  });
  assert(ibanPatch.status === 200, `run ${run}: iban patch failed`);

  const duplicate = await http("/api/households/register", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      village_id: 1,
      head_name: "تکراری",
      national_id: String(Number(unique) + 1).slice(-10).padStart(10, "2"),
      bank_iban: "IR820540102680020817909002",
    }),
  });
  assert(duplicate.status === 409, `run ${run}: duplicate register must 409`);

  console.log(`run ${run}: KYC-REG-1 OK`);
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
  console.log("KYC-REG-1: 3/3 passes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
