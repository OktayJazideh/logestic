/**
 * WF-QUEUE-1: spike — ENABLE_DISPATCH_QUEUE=false, GET /api/admin/dispatch-queue → 501.
 * Run 3x: npm run test:wf-queue1
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { env, isDispatchQueueEnabled } from "../src/config/env";
import { ensureTestHttpServer, runIntegrationScript, testFetch as http } from "./lib/testHttpServer";

const OP_MOBILE = "09000000002";
const MINE_ID = 1;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

async function selectWorkspace(token: string, mineId: number) {
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mine_id: mineId, membership_kind: "OPERATIONAL" }),
  });
  assert(r.status === 200 && r.json.success, `workspace select failed: ${JSON.stringify(r.json)}`);
}

async function runOnce(run: number) {
  assert(!isDispatchQueueEnabled(), `run ${run}: ENABLE_DISPATCH_QUEUE must default false`);
  assert(env.ENABLE_DISPATCH_QUEUE !== true, `run ${run}: env.ENABLE_DISPATCH_QUEUE must not be true`);

  const token = await loginAs(OP_MOBILE);
  await selectWorkspace(token, MINE_ID);

  const queue = await http("/api/admin/dispatch-queue", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(queue.status === 501, `run ${run}: expected 501, got ${queue.status}`);
  assert(queue.json?.success === false, `run ${run}: success must be false`);
  const err = queue.json?.error;
  assert(err?.code === "not_implemented", `run ${run}: code=${err?.code}`);
  assert(
    typeof err?.details?.message_fa === "string" && err.details.message_fa.length > 0,
    `run ${run}: message_fa missing in error.details`,
  );
  assert(
    err.message.includes("ENABLE_DISPATCH_QUEUE") || err.message.includes("not implemented"),
    `run ${run}: unexpected message: ${err?.message}`,
  );

  const board = await http("/api/admin/dispatch-board", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(board.status === 200 && board.json?.success, `run ${run}: dispatch-board must still work`);
}

async function main() {
  await initAppContext();
  await ensureTestHttpServer();
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
    console.log(`WF-QUEUE-1 run ${run}/3 OK`);
  }
  console.log("WF-QUEUE-1: all runs passed");
}

runIntegrationScript(main);
