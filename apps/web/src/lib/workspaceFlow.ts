import type { NavigateFunction } from "react-router-dom";
import { apiGetData, apiPostData } from "../api";
import type { WorkspaceRow } from "../pages/WorkspaceSelectPage";

export const ADMIN_WORKSPACE_ROLE = "ADMIN";

export function isAdminWorkspaceRole(role?: string | null): boolean {
  return role === ADMIN_WORKSPACE_ROLE;
}

export function dedupeOperationalWorkspaces(workspaces: WorkspaceRow[]): WorkspaceRow[] {
  const seen = new Set<number>();
  const rows: WorkspaceRow[] = [];
  for (const w of workspaces) {
    if (w.membership_kind !== "OPERATIONAL") continue;
    if (seen.has(w.mine_id)) continue;
    seen.add(w.mine_id);
    rows.push(w);
  }
  return rows;
}

export function workspaceKey(w: WorkspaceRow): string {
  return `${w.membership_kind}:${w.mine_id}:${w.cooperative_id ?? 0}`;
}

export function workspaceLabel(w: WorkspaceRow): string {
  if (w.membership_kind === "COMMUNITY") {
    return w.subtitle || w.mine_name;
  }
  return w.mine_name || w.subtitle;
}

async function selectWorkspaceApi(ws: WorkspaceRow) {
  return apiPostData<{ mine_id: number }>("/workspaces/select", {
    mine_id: ws.mine_id,
    membership_kind: ws.membership_kind,
    ...(ws.cooperative_id != null ? { cooperative_id: ws.cooperative_id } : {}),
  });
}

/** بعد از OTP یا بررسی سشن: auto-select تک‌workspace یا هدایت به picker */
export async function resolvePostAuthNavigation(
  navigate: NavigateFunction,
  opts?: { replace?: boolean },
): Promise<boolean> {
  const replace = opts?.replace ?? true;
  const meRes = await apiGetData<{ mine_id: number | null }>("/auth/me");
  if (meRes.status === 401) return false;
  if (meRes.ok && meRes.data.mine_id != null) {
    navigate("/panel", { replace });
    return true;
  }
  const wsRes = await apiGetData<{ workspaces: WorkspaceRow[] }>("/workspaces");
  if (!wsRes.ok || wsRes.data.workspaces.length === 0) {
    navigate("/workspace-select", { replace });
    return true;
  }
  if (wsRes.data.workspaces.length === 1) {
    const sel = await selectWorkspaceApi(wsRes.data.workspaces[0]);
    if (sel.ok) {
      navigate("/panel", { replace });
      return true;
    }
  }
  navigate("/workspace-select", { replace });
  return true;
}
