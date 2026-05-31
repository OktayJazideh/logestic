/**
 * OBJ-DB-1: objections persist across server restart (re-init context).
 * Run: npm run test:obj-db1
 * Requires: DATABASE_URL, db:migrate, db:seed.
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";
import { prisma } from "../src/db/prisma";

let testServer: Server | null = null;
let baseUrl = "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function bootServer(): Promise<string> {
  await initAppContext();
  await appContext.entities.hydrate();
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

async function stopServer() {
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => (err ? reject(err) : resolve()));
    });
    testServer = null;
    baseUrl = "";
  }
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
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

async function main() {
  try {
    await bootServer();

    const households = appContext.entities.listHouseholdsByCooperative(1);
    assert(households.length > 0, "need household in coop 1 — run db:seed");
    const target = households[0]!;

    const coopToken = await loginAs("09000000001");
    const reason = `OBJ-DB-1 persist ${Date.now()}`;

    const created = await http("/api/coop/objections", {
      method: "POST",
      headers: { Authorization: `Bearer ${coopToken}` },
      body: JSON.stringify({ household_id: target.id, reason }),
    });
    assert(created.status === 200 && created.json.success, `create failed: ${JSON.stringify(created.json)}`);
    const objectionId = created.json.data.objection.id as number;

    const dbRow = await prisma.membership_objections.findUnique({ where: { id: BigInt(objectionId) } });
    assert(dbRow != null && dbRow.reason === reason, "row missing in Postgres after create");
    assert(dbRow.reporter_user_id != null, "reporter_user_id must be NOT NULL in Postgres");

    await stopServer();
    await bootServer();

    const afterRestart = await http("/api/coop/objections", {
      headers: { Authorization: `Bearer ${coopToken}` },
    });
    assert(afterRestart.status === 200, "list after restart failed");
    const items = afterRestart.json.data.objections as { id: number; reason: string; status: string }[];
    const found = items.find((o) => o.id === objectionId);
    assert(found != null, "objection not found after simulated restart");
    assert(found.reason === reason, "reason mismatch after restart");
    assert(found.status === "PENDING", "status should remain PENDING");

    const anonymous = await http("/api/coop/objections", {
      method: "POST",
      body: JSON.stringify({ household_id: target.id, reason: "ناشناس" }),
    });
    assert(anonymous.status === 401, "anonymous submit should 401");

    // eslint-disable-next-line no-console
    console.log(`OBJ-DB-1 OK — objection id ${objectionId} persisted after restart`);
  } finally {
    await stopServer();
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
