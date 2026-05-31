/**
 * RULE-1: finance_rules + RuleEngine — split.owner 0.85 → 0.80 affects next mission only.
 * Run 3x: npm run test:rule1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { initAppContext } from "../src/lib/appInit";
import { ruleEngine, RULE_DEFAULTS, SEED_RULE_KEYS } from "../src/services/ruleEngine";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
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
    throw new Error(`verify failed: ${JSON.stringify(verify.json)}`);
  }
  return verify.json.data.access_token as string;
}

async function resetRules(adminUserId: number) {
  await prisma.finance_rules.deleteMany({});
  const epoch = new Date("2026-01-01T00:00:00.000Z");
  for (const key of SEED_RULE_KEYS) {
    await ruleEngine.setActive(key, RULE_DEFAULTS[key], { type: "GLOBAL" }, epoch, adminUserId);
  }
}

async function runOnce(run: number) {
  const admin = await prisma.users.findFirst({ where: { mobile_number: "09000000000" } });
  if (!admin) throw new Error("admin user missing");
  const adminId = Number(admin.id);

  await resetRules(adminId);
  await initAppContext();

  const beforeChange = await ruleEngine.getSplitRatios({ mineId: 1, at: new Date("2026-05-10T12:00:00.000Z") });
  if (beforeChange.owner !== 0.98) {
    throw new Error(`run ${run}: expected owner 0.98 before change, got ${beforeChange.owner}`);
  }

  const adminToken = await loginAs("09000000000");
  const headers = { Authorization: `Bearer ${adminToken}` };

  const list = await http("/api/admin/rules?status=ACTIVE", { headers });
  if (list.status !== 200 || !list.json.success) {
    throw new Error(`run ${run}: GET rules failed ${JSON.stringify(list.json)}`);
  }
  const activeRules = list.json.data.rules as Array<{ key: string; value: unknown }>;
  if (!activeRules.some((r) => r.key === "split.owner")) {
    throw new Error(`run ${run}: split.owner not in active rules list`);
  }

  const postRule = await http("/api/admin/rules", {
    method: "POST",
    headers,
    body: JSON.stringify({
      key: "split.owner",
      value: 0.8,
      scope: { type: "GLOBAL" },
      effective_from: "2026-05-15T00:00:00.000Z",
    }),
  });
  if (postRule.status !== 201 || !postRule.json.success) {
    throw new Error(`run ${run}: POST rule failed ${JSON.stringify(postRule.json)}`);
  }

  const historical = await ruleEngine.getSplitRatios({ mineId: 1, at: new Date("2026-05-10T12:00:00.000Z") });
  if (historical.owner !== 0.98) {
    throw new Error(`run ${run}: historical mission date should stay 0.98, got ${historical.owner}`);
  }

  const afterChange = await ruleEngine.getSplitRatios({ mineId: 1, at: new Date("2026-05-16T12:00:00.000Z") });
  if (afterChange.owner !== 0.8) {
    throw new Error(`run ${run}: new mission date expected 0.80, got ${afterChange.owner}`);
  }

  const totalFare = 1000;
  const ownerA = totalFare * historical.owner;
  const ownerB = totalFare * afterChange.owner;
  if (Math.abs(ownerA - 980) > 0.01 || Math.abs(ownerB - 800) > 0.01) {
    throw new Error(`run ${run}: fare split mismatch A=${ownerA} B=${ownerB}`);
  }

  const threshold = await ruleEngine.getNumber("weighbridge.threshold", { mineId: 1 });
  if (threshold !== 0.05) {
    throw new Error(`run ${run}: weighbridge.threshold expected 0.05, got ${threshold}`);
  }

  const periodKey = await ruleEngine.getPeriodKey(new Date("2026-05-16T12:00:00.000Z"), { mineId: 1 });
  if (periodKey !== "2026-05") {
    throw new Error(`run ${run}: period key expected 2026-05, got ${periodKey}`);
  }

  const audits = await prisma.audit_logs.findMany({
    where: { entity_type: "finance_rule", action: "ACTIVATED" },
    orderBy: { created_at: "desc" },
    take: 10,
  });
  if (!audits.some((a) => (a.after_value as { key?: string })?.key === "split.owner")) {
    throw new Error(`run ${run}: missing finance_rule ACTIVATED audit`);
  }

  const coopDenied = await http("/api/admin/rules", {
    method: "POST",
    headers: { Authorization: `Bearer ${await loginAs("09000000001")}` },
    body: JSON.stringify({
      key: "split.owner",
      value: 0.5,
      scope: { type: "GLOBAL" },
      effective_from: "2026-05-20T00:00:00.000Z",
    }),
  });
  if (coopDenied.status !== 403) {
    throw new Error(`run ${run}: expected 403 for non-admin POST, got ${coopDenied.status}`);
  }

  // eslint-disable-next-line no-console
  console.log(`RULE-1 run ${run} OK: historical=${historical.owner}, new=${afterChange.owner}, period=${periodKey}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("RULE-1: all 3 runs passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
