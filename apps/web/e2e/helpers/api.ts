import type { APIRequestContext } from "@playwright/test";

export const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

export async function loginApi(request: APIRequestContext, mobile: string): Promise<string> {
  await request.post(`${apiBase}/api/auth/request-otp`, {
    data: { mobile_number: mobile },
  });
  const otpRes = await request.get(`${apiBase}/api/auth/__dev/otp?mobile_number=${mobile}`);
  const otpJson = (await otpRes.json()) as { data?: { otp?: string } };
  const otp = otpJson.data?.otp;
  if (!otp) throw new Error(`dev OTP missing for ${mobile}`);
  const verify = await request.post(`${apiBase}/api/auth/verify-otp`, {
    data: { mobile_number: mobile, otp_code: otp },
  });
  const body = (await verify.json()) as { success?: boolean; data?: { access_token?: string } };
  if (!body.success || !body.data?.access_token) {
    throw new Error(`login failed for ${mobile}`);
  }
  return body.data.access_token;
}

export async function selectWorkspace(
  request: APIRequestContext,
  token: string,
  mineId: number,
  opts?: { cooperativeId?: number; membership_kind?: "OPERATIONAL" | "COMMUNITY" },
) {
  const r = await request.post(`${apiBase}/api/workspaces/select`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      mine_id: mineId,
      cooperative_id: opts?.cooperativeId,
      membership_kind: opts?.membership_kind ?? "OPERATIONAL",
    },
  });
  const json = (await r.json()) as { success?: boolean };
  if (!r.ok() || !json.success) {
    throw new Error(`workspace select failed for mine ${mineId}: ${JSON.stringify(json)}`);
  }
}

/** Resolve driver session for dispatched mission (dev seed + disp test fleet). */
export async function loginDriverForAssignment(
  request: APIRequestContext,
  adminToken: string,
  mineId: number,
  driverId: number,
): Promise<string> {
  const grant = await request.post(`${apiBase}/api/__dev/workspaces/ensure-driver-mine`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { mine_id: mineId, driver_id: driverId },
  });
  const grantJson = (await grant.json()) as {
    success?: boolean;
    data?: { mobile_number?: string | null };
  };
  if (!grant.ok() || !grantJson.success || !grantJson.data?.mobile_number) {
    throw new Error(`ensure-driver-mine failed: ${JSON.stringify(grantJson)}`);
  }
  const token = await loginApi(request, grantJson.data.mobile_number);
  await selectWorkspace(request, token, mineId, { cooperativeId: 1 });
  return token;
}

export async function cleanupSettlementPeriodApi(
  request: APIRequestContext,
  adminToken: string,
  mineId: number,
  year?: number,
  month?: number,
) {
  const r = await request.post(`${apiBase}/api/__dev/cleanup/settlement-period`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { mine_id: mineId, year, month },
  });
  const json = (await r.json()) as { success?: boolean };
  if (!r.ok() || !json.success) {
    throw new Error(`cleanup settlement-period failed: ${JSON.stringify(json)}`);
  }
}

export async function pollJobApi(
  request: APIRequestContext,
  jobId: string,
  token: string,
): Promise<{ status: string; result?: unknown; error?: string }> {
  for (let i = 0; i < 150; i++) {
    const r = await request.get(`${apiBase}/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await r.json()) as {
      success?: boolean;
      data?: { job?: { status: string; error?: string; result?: unknown } };
    };
    if (!r.ok() || !json.success || !json.data?.job) {
      throw new Error(`poll job ${jobId} failed: ${JSON.stringify(json)}`);
    }
    const job = json.data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`poll timeout for job ${jobId}`);
}
