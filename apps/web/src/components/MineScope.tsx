import React, { useEffect, useState } from "react";
import { apiGetData, apiPostData, getStoredToken } from "../api";

export type MineRow = { id: number; mine_code: string; name: string };

type Props = {
  /** پس از انتخاب موفق معدن در سشن سرور */
  onMineSelected?: (mineId: number) => void;
};

export function MineScope({ onMineSelected }: Props) {
  const [mines, setMines] = useState<MineRow[]>([]);
  const [choice, setChoice] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeMineId, setActiveMineId] = useState<number | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setMsg("ابتدا توکن Bearer را در بالای صفحه وارد کنید.");
      return;
    }
    apiGetData<{ mines: MineRow[] }>("/mines").then((r) => {
      if (r.ok) {
        setMines(r.data.mines);
        setMsg(null);
      } else {
        setMsg(r.message);
      }
    });
  }, []);

  async function applyMine() {
    if (choice === "") return;
    setBusy(true);
    setMsg(null);
    const r = await apiPostData<{ mine_id: number }>("/mine/select", { mine_id: choice });
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
          value={choice === "" ? "" : String(choice)}
          onChange={(e) => setChoice(e.target.value ? Number(e.target.value) : "")}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", minWidth: 200 }}
        >
          <option value="">— انتخاب معدن —</option>
          {mines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.mine_code})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || choice === ""}
          onClick={() => void applyMine()}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #1d4ed8",
            background: choice === "" ? "#E5E7EB" : "#2563EB",
            color: choice === "" ? "#6B7280" : "#fff",
            cursor: choice === "" ? "not-allowed" : "pointer",
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
