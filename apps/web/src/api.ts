const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000/api";

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

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

export async function apiGetData<T>(path: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` },
    });
    const j = (await r.json()) as unknown;
    if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === false) {
      const e = (j as { error?: { message?: string; code?: string } }).error;
      return { ok: false, message: e?.message ?? "خطا", code: e?.code };
    }
    if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === true && "data" in j) {
      return { ok: true, data: (j as { data: T }).data };
    }
    return { ok: false, message: "پاسخ نامعتبر از سرور" };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

export async function apiPostData<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getStoredToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as unknown;
    if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === false) {
      const e = (j as { error?: { message?: string; code?: string } }).error;
      return { ok: false, message: e?.message ?? "خطا", code: e?.code };
    }
    if (j && typeof j === "object" && "success" in j && (j as { success: boolean }).success === true && "data" in j) {
      return { ok: true, data: (j as { data: T }).data };
    }
    return { ok: false, message: "پاسخ نامعتبر از سرور" };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

export { API_BASE };
