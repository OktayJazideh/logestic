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

export { API_BASE };
