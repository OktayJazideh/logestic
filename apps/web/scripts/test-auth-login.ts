/**
 * AUTH-1 web flow smoke (mirrors LoginPage API calls). Run 3x:
 *   npx tsx scripts/test-auth-login.ts
 * Requires backend on TEST_BASE_URL (default http://localhost:4000).
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";
const API = `${BASE}/api`;

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function runOnce(run: number) {
  const mobile = `0913000${String(run).padStart(4, "0")}`.slice(0, 11);

  const req = await http("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile }),
  });
  if (req.status !== 200 || !req.json.success) {
    throw new Error(`request-otp failed run ${run}: ${JSON.stringify(req.json)}`);
  }

  const devOtp = await http(`/auth/__dev/otp?mobile_number=${mobile}`);
  const code = devOtp.json?.data?.otp as string | undefined;
  if (!code) throw new Error(`dev otp missing run ${run}`);

  const bad = await http("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: "000000" }),
  });
  if (bad.status !== 400) throw new Error(`expected 400 on bad otp run ${run}`);

  const verify = await http("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile_number: mobile, otp_code: code }),
  });
  if (verify.status !== 200 || !verify.json.success) {
    throw new Error(`verify-otp failed run ${run}`);
  }

  const token = verify.json.data.access_token as string;
  if (!token || token.length < 8) throw new Error(`invalid token run ${run}`);

  const me = await http("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (me.status !== 200 || !me.json.success) throw new Error(`/auth/me failed run ${run}`);

  const meBad = await http("/auth/me", {
    headers: { Authorization: "Bearer invalid-token" },
  });
  if (meBad.status !== 401) throw new Error(`expected 401 on bad token run ${run}`);

  // eslint-disable-next-line no-console
  console.log(`Run ${run} OK — mobile=${mobile}, role=${me.json.data.role}`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runOnce(i);
  }
  // eslint-disable-next-line no-console
  console.log("All 3 AUTH-1 web flow runs passed.");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
