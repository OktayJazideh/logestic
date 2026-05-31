import React, { useEffect, useState } from "react";
import { apiGetData, apiPostData, getStoredToken } from "../api";

export type WorkspaceRow = {
  membership_kind: "COMMUNITY" | "OPERATIONAL";
  mine_id: number;
  mine_name: string;
  cooperative_id?: number;
  subtitle: string;
  roles: string[];
};

type Props = {
  /** پس از انتخاب موفق معدن در سشن سرور */
  onMineSelected?: (mineId: number) => void;
};

export function MineScope({ onMineSelected }: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [choice, setChoice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeMineId, setActiveMineId] = useState<number | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setMsg("ابتدا توکن Bearer را در بالای صفحه وارد کنید.");
      return;
    }
    apiGetData<{ workspaces: WorkspaceRow[] }>("/workspaces").then((r) => {
      if (r.ok) {
        setWorkspaces(r.data.workspaces);
        setMsg(null);
      } else {
        setMsg(r.message);
      }
    });
  }, []);

  function workspaceKey(w: WorkspaceRow) {
    return `${w.membership_kind}:${w.mine_id}:${w.cooperative_id ?? 0}`;
  }

  async function applyMine() {
    if (!choice) return;
    setBusy(true);
    setMsg(null);
    const ws = workspaces.find((w) => workspaceKey(w) === choice);
    if (!ws) {
      setBusy(false);
      setMsg("فضای کاری انتخاب‌شده نامعتبر است.");
      return;
    }
    const r = await apiPostData<{ mine_id: number }>("/workspaces/select", {
      mine_id: ws.mine_id,
      membership_kind: ws.membership_kind,
      ...(ws.cooperative_id != null ? { cooperative_id: ws.cooperative_id } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setActiveMineId(r.data.mine_id);
      onMineSelected?.(r.data.mine_id);
    } else {
      setMsg(r.message);
    }
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #E5E7EB",
        background: "#F9FAFB",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8, color: "#111827" }}>محدوده معدن</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          data-testid="mine-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", minWidth: 200 }}
        >
          <option value="">— انتخاب معدن —</option>
          {workspaces.map((w) => (
            <option
              key={`${w.membership_kind}-${w.mine_id}-${w.cooperative_id ?? 0}`}
              value={workspaceKey(w)}
            >
              {w.membership_kind === "COMMUNITY" ? "تعاونی" : "معدن"}: {w.subtitle} ({w.roles.join(", ")})
            </option>
          ))}
        </select>
        <button
          data-testid="mine-apply"
          type="button"
          disabled={busy || !choice}
          onClick={() => void applyMine()}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #1E3A2F",
            background: !choice ? "#E5E7EB" : "#6B5B4F",
            color: !choice ? "#6B7280" : "#fff",
            cursor: !choice ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          ثبت معدن فعال
        </button>
        {activeMineId != null && (
          <span style={{ fontSize: 13, color: "#059669" }}>
            معدن فعال در سشن: <strong>{activeMineId}</strong>
          </span>
        )}
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: "#B45309" }}>{msg}</div>}
    </div>
  );
}
