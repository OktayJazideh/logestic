import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, apiPatchData } from "../api";

type AdminUser = {
  id: number;
  mobile_number: string;
  role: string;
  cooperative_id?: number;
  is_active: boolean;
};

const ROLES = [
  "ADMIN",
  "OPERATION_ADMIN",
  "COOP_ADMIN",
  "COOP_OPERATOR",
  "CONSULTANT",
  "DRIVER",
  "FLEET_OWNER",
  "HOUSEHOLD",
  "COOP",
  "EMPLOYER",
] as const;

const COOP_ROLES = new Set(["COOP_ADMIN", "COOP_OPERATOR", "COOP"]);

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<number, string>>({});
  const [draftCoops, setDraftCoops] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const res = await apiGetData<{ users: AdminUser[] }>("/admin/users");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setUsers(res.data.users);
    const roles: Record<number, string> = {};
    const coops: Record<number, string> = {};
    for (const u of res.data.users) {
      roles[u.id] = u.role;
      coops[u.id] = u.cooperative_id != null ? String(u.cooperative_id) : "";
    }
    setDraftRoles(roles);
    setDraftCoops(coops);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(userId: number) {
    const role = draftRoles[userId];
    if (!role) return;
    setBusy(userId);
    const body: { role: string; cooperative_id?: number | null } = { role };
    if (COOP_ROLES.has(role)) {
      const coop = draftCoops[userId];
      if (!coop) {
        setError("برای نقش تعاونی، شناسهٔ cooperative_id الزامی است.");
        setBusy(null);
        return;
      }
      body.cooperative_id = Number(coop);
    } else {
      body.cooperative_id = null;
    }
    const res = await apiPatchData<{ user: AdminUser }>(`/admin/users/${userId}/role`, body);
    setBusy(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    await load();
  }

  return (
    <PageFrame title="مدیریت نقش کاربران" expectedRoles={["ADMIN"]} intro="فقط ADMIN می‌تواند نقش و تعاونی کاربران را تخصیص دهد.">
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" }}>
              <th style={th}>موبایل</th>
              <th style={th}>نقش</th>
              <th style={th}>cooperative_id</th>
              <th style={th}>فعال</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                <td style={td}>{u.mobile_number}</td>
                <td style={td}>
                  <select
                    value={draftRoles[u.id] ?? u.role}
                    onChange={(e) => setDraftRoles((d) => ({ ...d, [u.id]: e.target.value }))}
                    style={inputStyle}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td}>
                  <input
                    type="number"
                    min={1}
                    disabled={!COOP_ROLES.has(draftRoles[u.id] ?? u.role)}
                    value={draftCoops[u.id] ?? ""}
                    onChange={(e) => setDraftCoops((d) => ({ ...d, [u.id]: e.target.value }))}
                    placeholder="—"
                    style={{ ...inputStyle, width: 80 }}
                  />
                </td>
                <td style={td}>{u.is_active ? "بله" : "خیر"}</td>
                <td style={td}>
                  <button
                    type="button"
                    disabled={busy === u.id}
                    onClick={() => void save(u.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#1B5E20",
                      color: "#fff",
                      cursor: busy === u.id ? "wait" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {busy === u.id ? "…" : "ذخیره"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}

const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 8px" };
const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  fontSize: 13,
};
