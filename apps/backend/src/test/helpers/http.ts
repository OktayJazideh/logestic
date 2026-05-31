const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";

export function testBaseUrl(): string {
  return BASE;
}

export async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function http(path: string, init?: RequestInit & { idempotencyKey?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }
  const { idempotencyKey: _k, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const json = await res.json();
  return {
    status: res.status,
    json,
    replayed: res.headers.get("Idempotency-Replayed"),
  };
}

export async function loginAs(mobile: string): Promise<string> {
  await http("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile }),
  });
  const devOtp = await http(`/api/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp as string | undefined;
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

export type SelectMineOptions = {
  cooperativeId?: number;
  membershipKind?: "COMMUNITY" | "OPERATIONAL";
};

export async function selectMine(token: string, mineId: number, opts?: SelectMineOptions) {
  const body: Record<string, number | string> = { mine_id: mineId };
  if (opts?.cooperativeId != null) body.cooperative_id = opts.cooperativeId;
  if (opts?.membershipKind != null) body.membership_kind = opts.membershipKind;
  const r = await http("/api/workspaces/select", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (r.status !== 200 || !r.json.success) {
    throw new Error(`workspace select failed: ${JSON.stringify(r.json)}`);
  }
}

/** COOP_ADMIN / COOP_OPERATOR need COMMUNITY workspace + cooperative_id. */
export async function selectCommunityMine(token: string, mineId: number, cooperativeId: number) {
  return selectMine(token, mineId, { cooperativeId, membershipKind: "COMMUNITY" });
}

/** Standard workspace selection for demo mission / settlement integration flows. */
export async function prepareDemoMissionWorkspaces(params: {
  mineId: number;
  cooperativeId?: number;
  driverToken: string;
  coopOpToken: string;
  coopAdminToken: string;
  opAdminToken: string;
}) {
  const coopId = params.cooperativeId ?? 1;
  await selectMine(params.driverToken, params.mineId);
  await selectCommunityMine(params.coopOpToken, params.mineId, coopId);
  await selectCommunityMine(params.coopAdminToken, params.mineId, coopId);
  await selectMine(params.opAdminToken, params.mineId);
}

export async function pollJobHttp(jobId: string, token: string) {
  for (let i = 0; i < 150; i++) {
    const r = await http(`/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200 || !r.json.success) {
      throw new Error(`poll job ${jobId} failed: ${JSON.stringify(r.json)}`);
    }
    const job = r.json.data.job as { status: string; error?: string; result?: unknown };
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`poll timeout for job ${jobId}`);
}

export function assertOk(status: number, json: { success?: boolean }, label: string) {
  if (status < 200 || status >= 300 || json.success !== true) {
    throw new Error(`${label}: ${status} ${JSON.stringify(json)}`);
  }
}
