const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000/api";

/** UUID v4 for Idempotency-Key on sensitive POST endpoints (IDEM-1). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function getStoredToken(): string {
  return localStorage.getItem("auth_token") ?? "";
}

export function setStoredToken(token: string) {
  if (token) localStorage.setItem("auth_token", token);
  else localStorage.removeItem("auth_token");
}

export async function apiGet(path: string): Promise<unknown> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getStoredToken()}` },
  });
  return r.json();
}

export async function apiPost(
  path: string,
  body: unknown,
  opts?: { idempotencyKey?: string; skipIdempotency?: boolean },
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStoredToken()}`,
    "Content-Type": "application/json",
  };
  if (!opts?.skipIdempotency) {
    headers["Idempotency-Key"] = opts?.idempotencyKey ?? newIdempotencyKey();
  }
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return r.json();
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; message: string; code?: string; status: number; details?: unknown };

function parseApiJson<T>(j: unknown, status: number): ApiResult<T> {
  if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === false) {
    const e = (j as { error?: { message?: string; code?: string; details?: unknown } }).error;
    return {
      ok: false,
      message: e?.message ?? "خطا",
      code: e?.code,
      status,
      details: e?.details,
    };
  }
  if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === true && "data" in j) {
    return { ok: true, data: (j as { data: T }).data, status };
  }
  return { ok: false, message: "پاسخ نامعتبر از سرور", status };
}

export async function apiGetData<T>(path: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` },
    });
    const j = (await r.json()) as unknown;
    const parsed = parseApiJson<T>(j, r.status);
    if (!parsed.ok && r.status === 401) {
      return { ...parsed, status: 401, code: parsed.code ?? "unauthorized" };
    }
    return parsed;
  } catch (e) {
    return { ok: false, message: String(e), status: 0 };
  }
}

/** POST بدون هدر Authorization — برای request-otp و verify-otp */
export async function apiPostPublic<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as unknown;
    return parseApiJson<T>(j, r.status);
  } catch (e) {
    return { ok: false, message: String(e), status: 0 };
  }
}

export async function apiPatchData<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getStoredToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as unknown;
    return parseApiJson<T>(j, r.status);
  } catch (e) {
    return { ok: false, message: String(e), status: 0 };
  }
}

export async function apiPutData<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getStoredToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as unknown;
    return parseApiJson<T>(j, r.status);
  } catch (e) {
    return { ok: false, message: String(e), status: 0 };
  }
}

export async function apiPostData<T>(
  path: string,
  body: unknown,
  opts?: { idempotencyKey?: string; skipIdempotency?: boolean },
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${getStoredToken()}`,
      "Content-Type": "application/json",
    };
    if (!opts?.skipIdempotency) {
      headers["Idempotency-Key"] = opts?.idempotencyKey ?? newIdempotencyKey();
    }
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as unknown;
    return parseApiJson<T>(j, r.status);
  } catch (e) {
    return { ok: false, message: String(e), status: 0 };
  }
}

export type JobRecord = {
  id: string;
  queue: string;
  job_name: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error?: string;
  result?: unknown;
};

/** Poll async job until completed or failed (QUEUE-1). */
export async function pollJobUntilDone(
  jobId: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<JobRecord> {
  const intervalMs = opts?.intervalMs ?? 400;
  const maxAttempts = opts?.maxAttempts ?? 150;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await apiGetData<{ job: JobRecord }>(`/admin/jobs/${jobId}`);
    if (!r.ok) throw new Error(r.message);
    const job = r.data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "job_failed");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("job_poll_timeout");
}

export { API_BASE };
