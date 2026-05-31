import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPostData } from "../api";

type FinanceRule = {
  id: number;
  key: string;
  value: unknown;
  scope_type: "GLOBAL" | "MINE" | "COOPERATIVE";
  mine_id?: number;
  cooperative_id?: number;
  effective_from: string;
  effective_to?: string;
  version: number;
  status: "ACTIVE" | "ARCHIVED";
};

const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #E5E7EB" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #E5E7EB" };
const alertStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#991B1B",
  fontSize: 13,
};
const okStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#065F46",
  fontSize: 13,
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" };
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  fontSize: 13,
  minWidth: 120,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#1B5E20",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

function formatValue(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export default function RuleEnginePage() {
  const [rules, setRules] = useState<FinanceRule[]>([]);
  const [knownKeys, setKnownKeys] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"" | "ACTIVE" | "ARCHIVED">("ACTIVE");

  const [key, setKey] = useState("split.owner");
  const [value, setValue] = useState("0.85");
  const [scopeType, setScopeType] = useState<"GLOBAL" | "MINE" | "COOPERATIVE">("GLOBAL");
  const [mineId, setMineId] = useState("1");
  const [coopId, setCoopId] = useState("1");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const q = filterStatus ? `?status=${filterStatus}` : "";
    const r = await apiGetData<{ rules: FinanceRule[]; known_keys: string[] }>(`/admin/rules${q}`);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setErr(null);
    setRules(r.data.rules);
    setKnownKeys(r.data.known_keys ?? []);
  }, [filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(value);
    if (!Number.isFinite(num)) {
      setErr("مقدار باید عدد باشد.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const scope =
      scopeType === "GLOBAL"
        ? { type: "GLOBAL" as const }
        : scopeType === "MINE"
          ? { type: "MINE" as const, mine_id: Number(mineId) }
          : { type: "COOPERATIVE" as const, cooperative_id: Number(coopId) };
    const r = await apiPostData<{ rule: FinanceRule; archived: FinanceRule[] }>("/admin/rules", {
      key,
      value: num,
      scope,
      effective_from: `${effectiveFrom}T00:00:00.000Z`,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(`قانون فعال شد (نسخه ${r.data.rule.version})؛ ${r.data.archived.length} نسخهٔ قبلی بایگانی شد.`);
    await load();
  }

  return (
    <PageFrame
      title="Rule Engine (RULE-1)"
      intro="قوانین مالی نسخه‌دار: split، آستانه باسکول، دوره تسویه. فقط ADMIN."
    >
      {err && <div style={alertStyle}>{err}</div>}
      {msg && <div style={okStyle}>{msg}</div>}

      <form
        onSubmit={submit}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
          padding: 14,
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          background: "#F9FAFB",
        }}
      >
        <label style={labelStyle}>
          کلید
          <select value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle}>
            {(knownKeys.length ? knownKeys : [key]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          مقدار
          <input value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          scope
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as typeof scopeType)}
            style={inputStyle}
          >
            <option value="GLOBAL">GLOBAL</option>
            <option value="MINE">mine_id</option>
            <option value="COOPERATIVE">cooperative_id</option>
          </select>
        </label>
        {scopeType === "MINE" && (
          <label style={labelStyle}>
            mine_id
            <input value={mineId} onChange={(e) => setMineId(e.target.value)} style={inputStyle} />
          </label>
        )}
        {scopeType === "COOPERATIVE" && (
          <label style={labelStyle}>
            cooperative_id
            <input value={coopId} onChange={(e) => setCoopId(e.target.value)} style={inputStyle} />
          </label>
        )}
        <label style={labelStyle}>
          effective_from
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} style={inputStyle} />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? "…" : "فعال‌سازی نسخه جدید"}
          </button>
        </div>
      </form>

      <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>فیلتر وضعیت:</span>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} style={inputStyle}>
          <option value="">همه</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
        <button type="button" onClick={() => load()} style={{ ...btnStyle, background: "#374151" }}>
          بروزرسانی
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" }}>
              <th style={th}>کلید</th>
              <th style={th}>مقدار</th>
              <th style={th}>scope</th>
              <th style={th}>نسخه</th>
              <th style={th}>وضعیت</th>
              <th style={th}>از</th>
              <th style={th}>تا</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.key}</td>
                <td style={td}>{formatValue(r.value)}</td>
                <td style={td}>
                  {r.scope_type}
                  {r.mine_id != null ? ` mine=${r.mine_id}` : ""}
                  {r.cooperative_id != null ? ` coop=${r.cooperative_id}` : ""}
                </td>
                <td style={td}>{r.version}</td>
                <td style={td}>{r.status}</td>
                <td style={td}>{r.effective_from.slice(0, 10)}</td>
                <td style={td}>{r.effective_to?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}
