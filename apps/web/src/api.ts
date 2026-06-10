import { newIdempotencyKey } from "./lib/idempotencyKey";
import { apiErrorMessageFa } from "./lib/apiErrorsFa";
import { resolveApiBase } from "./lib/apiBase";

export { newIdempotencyKey };

const API_BASE = resolveApiBase();
const TOKEN_KEY = "auth_token";
const REMEMBER_KEY = "auth_remember";

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "";
}

/** @param remember — localStorage when true (default), sessionStorage when false */
export function setStoredToken(token: string, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REMEMBER_KEY, "1");
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REMEMBER_KEY, "0");
  }
}

export function getRememberMePreference(): boolean {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function setRememberMePreference(remember: boolean) {
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
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

function fetchFailureResult<T>(e: unknown): ApiResult<T> {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes("Unexpected token") && raw.includes("<")) {
    return {
      ok: false,
      message: apiErrorMessageFa("invalid_response"),
      code: "invalid_response",
      status: 0,
    };
  }
  if (raw === "Failed to fetch" || raw.includes("NetworkError") || raw.includes("fetch")) {
    return {
      ok: false,
      message: apiErrorMessageFa("network_error"),
      code: "network_error",
      status: 0,
    };
  }
  return { ok: false, message: apiErrorMessageFa(undefined, raw), status: 0 };
}

function parseApiJson<T>(j: unknown, status: number): ApiResult<T> {
  if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === false) {
    const e = (j as { error?: { message?: string; code?: string; details?: unknown } }).error;
    const code = e?.code;
    const rawMessage = e?.message ?? "خطا";
    return {
      ok: false,
      message: apiErrorMessageFa(code, rawMessage),
      code,
      status,
      details: e?.details,
    };
  }
  if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === true && "data" in j) {
    return { ok: true, data: (j as { data: T }).data, status };
  }
  if (status === 404) {
    return {
      ok: false,
      message: apiErrorMessageFa("endpoint_not_found"),
      code: "endpoint_not_found",
      status,
    };
  }
  if (j && typeof j === "object" && "error" in j) {
    const legacy = (j as { error?: string }).error;
    const code = legacy === "not_found" ? "endpoint_not_found" : "api_error";
    return {
      ok: false,
      message: apiErrorMessageFa(code, legacy === "not_found" ? "Not found" : String(legacy ?? "خطا")),
      code,
      status,
    };
  }
  return {
    ok: false,
    message: apiErrorMessageFa("invalid_response"),
    code: "invalid_response",
    status,
  };
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
    return fetchFailureResult<T>(e);
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
    let j: unknown;
    try {
      j = (await r.json()) as unknown;
    } catch (parseErr) {
      if (!r.ok) {
        return {
          ok: false,
          message: apiErrorMessageFa(r.status === 404 ? "endpoint_not_found" : "invalid_response"),
          code: r.status === 404 ? "endpoint_not_found" : "invalid_response",
          status: r.status,
        };
      }
      return fetchFailureResult<T>(parseErr);
    }
    return parseApiJson<T>(j, r.status);
  } catch (e) {
    return fetchFailureResult<T>(e);
  }
}

export async function apiDeleteData<T>(path: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getStoredToken()}` },
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
