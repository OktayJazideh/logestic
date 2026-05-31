/**
 * SLA-ESCALATION-1: approval_tasks due_at on submit, stale list API, overdue flag.
 * Run 3x: npm run test:sla-escalation1
 */
import "dotenv/config";
import { createServer, type Server } from "http";
import { createApp } from "../src/app";
import { initAppContext } from "../src/lib/appInit";
import { prisma } from "../src/db/prisma";
import { toBig } from "../src/repositories/id";
import { DEFAULT_APPROVAL_SLA_HOURS } from "../src/lib/slaConfig";

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

async function cleanup(run: number) {
  const now = new Date();
  const period_key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await prisma.period_statements.findMany({
    where: { mine_id: toBig(1), period_key },
  });
  for (const row of rows) {
    await prisma.approval_tasks.deleteMany({
      where: { entity_type: "period_statement", entity_id: String(row.id) },
    });
    await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
    await prisma.period_statements.delete({ where: { id: row.id } });
  }
  if (run === 1) {
    console.log(`cleanup: removed ${rows.length} period statement(s) for SLA test`);
  }
}

async function runOnce(run: number) {
  await cleanup(run);

  const adminToken = await loginAs("09000000000");
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const draft = await http("/api/admin/finance/period-statements/draft", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mine_id: 1, cooperative_id: 1, year, month }),
  });
  assert(draft.status === 201 && draft.json.success, `run ${run}: draft failed`);

  const statementId = draft.json.data.statement.id as number;

  const submit = await http(`/api/admin/finance/period-statements/${statementId}/submit-review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(submit.status === 200 && submit.json.data.statement.status === "PENDING_REVIEW", `run ${run}: submit`);

  const tasks = await prisma.approval_tasks.findMany({
    where: { entity_type: "period_statement", entity_id: String(statementId) },
    orderBy: { required_role: "asc" },
  });
  assert(tasks.length === 2, `run ${run}: expected 2 approval_tasks, got ${tasks.length}`);
  assert(
    tasks.every((t) => t.status === "PENDING" && t.due_at != null),
    `run ${run}: tasks must be PENDING with due_at`,
  );
  const roles = new Set(tasks.map((t) => t.required_role));
  assert(roles.has("COOP_ADMIN") && roles.has("OPERATION_ADMIN"), `run ${run}: missing roles`);

  const dueAt = tasks[0]!.due_at!;
  const expectedMs = DEFAULT_APPROVAL_SLA_HOURS * 60 * 60 * 1000;
  const delta = Math.abs(dueAt.getTime() - (tasks[0]!.created_at.getTime() + expectedMs));
  assert(delta < 5000, `run ${run}: due_at should be ~${DEFAULT_APPROVAL_SLA_HOURS}h from created_at`);

  const pastDue = new Date(Date.now() - 60_000);
  await prisma.approval_tasks.updateMany({
    where: { entity_type: "period_statement", entity_id: String(statementId) },
    data: { due_at: pastDue },
  });

  const stale = await http("/api/admin/approvals/stale?mine_id=1", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(stale.status === 200 && stale.json.success, `run ${run}: stale API failed`);
  const staleTasks = stale.json.data.tasks as Array<{ entity_id: string; entity_type: string }>;
  assert(
    staleTasks.some((t) => t.entity_type === "period_statement" && t.entity_id === String(statementId)),
    `run ${run}: stale list must include statement ${statementId}`,
  );

  const getOne = await http(`/api/admin/finance/period-statements/${statementId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(getOne.status === 200 && getOne.json.success, `run ${run}: get statement failed`);
  assert(
    getOne.json.data.statement.approval_overdue === true,
    `run ${run}: approval_overdue should be true after fast-forward`,
  );

  console.log(`run ${run}: PASS (SLA tasks=${tasks.length}, stale=${staleTasks.length}, sla_hours=${DEFAULT_APPROVAL_SLA_HOURS})`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
  }
  console.log("test:sla-escalation1 — all 3 runs OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
