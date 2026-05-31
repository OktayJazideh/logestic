/**
 * DB-1 integration checks (auth + mines + entities from Postgres).
 * Run 3x: npm run test:db1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { appContext } from "../src/appContext";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function runOnce(run: number) {
  const mobile = `0912000${String(run).padStart(4, "0")}`.slice(0, 11);

  const req = await http("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile }),
  });
  if (req.status !== 200 || !req.json.success) throw new Error(`request-otp failed run ${run}: ${JSON.stringify(req.json)}`);

  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp;
  if (!code) throw new Error(`dev otp missing run ${run}`);

  const verify = await http("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) throw new Error(`verify-otp failed run ${run}`);

  const token = verify.json.data.access_token as string;

  const mines = await http("/api/mines", { headers: { Authorization: `Bearer ${token}` } });
  if (mines.status !== 200 || !mines.json.data?.mines?.length) {
    throw new Error(`mines empty run ${run} — run npm run db:seed first`);
  }

  const sessionRow = await prisma.sessions.findUnique({ where: { token } });
  if (!sessionRow) throw new Error(`session not in DB run ${run}`);

  const userRow = await prisma.users.findUnique({ where: { mobile_number: mobile } });
  if (!userRow) throw new Error(`user not in DB run ${run}`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — mobile=${mobile}, mines=${mines.json.data.mines.length}, userId=${userRow.id}`);
  return token;
}

async function main() {
  await initAppContext();
  const mines = appContext.mineData.listMines();
  if (!mines.length) {
    throw new Error("No mines in cache — seed DB and restart server, or run db:seed");
  }

  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("DB-1 integration: 3/3 passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
