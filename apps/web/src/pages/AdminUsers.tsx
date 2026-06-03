import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { FormField } from "../components/FormField";
import { apiDeleteData, apiGetData, apiPatchData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { positiveInt } from "../lib/validation";
import { Alert, Button, Card, FormRow, FilterField, Input, Select } from "../components/ui";

type AdminUser = {
  id: number;
  mobile_number: string;
  national_id?: string;
  full_name?: string;
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
  "OPERATOR",
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
  const [showCreate, setShowCreate] = useState(false);
  const [draftRoles, setDraftRoles] = useState<Record<number, string>>({});
  const [draftCoops, setDraftCoops] = useState<Record<number, string>>({});
  const [draftActive, setDraftActive] = useState<Record<number, boolean>>({});

  const [newMobile, setNewMobile] = useState("");
  const [newNationalId, setNewNationalId] = useState("");
  const [newRole, setNewRole] = useState("OPERATOR");
  const [newCoop, setNewCoop] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const res = await apiGetData<{ users: AdminUser[] }>("/admin/users");
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setError(null);
    setUsers(res.data.users);
    const roles: Record<number, string> = {};
    const coops: Record<number, string> = {};
    const active: Record<number, boolean> = {};
    for (const u of res.data.users) {
      roles[u.id] = u.role;
      coops[u.id] = u.cooperative_id != null ? String(u.cooperative_id) : "";
      active[u.id] = u.is_active;
    }
    setDraftRoles(roles);
    setDraftCoops(coops);
    setDraftActive(active);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(userId: number) {
    const role = draftRoles[userId];
    if (!role) return;
    setBusy(userId);
    const body: {
      role: string;
      cooperative_id?: number | null;
      is_active?: boolean;
    } = { role, is_active: draftActive[userId] };
    if (COOP_ROLES.has(role)) {
      const coop = draftCoops[userId];
      const coopErr = !coop ? "برای نقش تعاونی، شناسهٔ cooperative_id الزامی است." : positiveInt("cooperative_id")(coop);
      if (coopErr) {
        setError(coopErr);
        setBusy(null);
        return;
      }
      body.cooperative_id = Number(coop);
    } else {
      body.cooperative_id = null;
    }
    const res = await apiPatchData<{ user: AdminUser }>(`/admin/users/${userId}`, body);
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setError(null);
    await load();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(-1);
    const body: Record<string, unknown> = {
      mobile_number: newMobile.trim(),
      national_id: newNationalId.trim(),
      role: newRole,
      full_name: newName.trim() || undefined,
      is_active: true,
    };
    if (COOP_ROLES.has(newRole)) {
      const coopErr = positiveInt("cooperative_id")(newCoop);
      if (coopErr) {
        setError(coopErr);
        setBusy(null);
        return;
      }
      body.cooperative_id = Number(newCoop);
    }
    const res = await apiPostData<{ user: AdminUser }>("/admin/users", body);
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setShowCreate(false);
    setNewMobile("");
    setNewNationalId("");
    setNewName("");
    setNewCoop("");
    await load();
  }

  async function remove(userId: number) {
    if (!window.confirm("کاربر غیرفعال و حذف نرم می‌شود. ادامه می‌دهید؟")) return;
    setBusy(userId);
    const res = await apiDeleteData<{ user: AdminUser }>(`/admin/users/${userId}`);
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    await load();
  }

  return (
    <PageFrame
      title="مدیریت کاربران"
      expectedRoles={["ADMIN"]}
      intro="ایجاد، ویرایش نقش، غیرفعال‌سازی. درخواست‌های واحدها در صندوق تأیید بررسی می‌شوند."
    >
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "بستن فرم" : "کاربر جدید"}
        </Button>
        <Link to="/panel/admin/user-requests" style={{ alignSelf: "center", fontSize: 13 }}>
          صندوق درخواست‌ها
        </Link>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <FormRow
            as="form"
            onSubmit={(e) => void createUser(e)}
            actions={
              <Button type="submit" disabled={busy === -1}>
                {busy === -1 ? "…" : "ایجاد"}
              </Button>
            }
          >
            <FilterField minWidth={140}>
              <FormField label="موبایل" required>
                <Input value={newMobile} onChange={(e) => setNewMobile(e.target.value)} placeholder="09xxxxxxxxx" />
              </FormField>
            </FilterField>
            <FilterField minWidth={140}>
              <FormField label="کد ملی" required>
                <Input value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} />
              </FormField>
            </FilterField>
            <FilterField minWidth={120}>
              <FormField label="نقش">
                <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </FormField>
            </FilterField>
            {COOP_ROLES.has(newRole) && (
              <FilterField minWidth={100}>
                <FormField label="cooperative_id" required>
                  <Input type="number" min={1} value={newCoop} onChange={(e) => setNewCoop(e.target.value)} />
                </FormField>
              </FilterField>
            )}
            <FilterField minWidth={140}>
              <FormField label="نام">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </FormField>
            </FilterField>
          </FormRow>
        </Card>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" }}>
              <th style={th}>موبایل</th>
              <th style={th}>کد ملی</th>
              <th style={th}>نام</th>
              <th style={th}>نقش</th>
              <th style={th}>تعاونی</th>
              <th style={th}>فعال</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                <td style={td}>{u.mobile_number}</td>
                <td style={td}>{u.national_id ?? "—"}</td>
                <td style={td}>{u.full_name ?? "—"}</td>
                <td style={td}>
                  <Select
                    value={draftRoles[u.id] ?? u.role}
                    onChange={(e) => setDraftRoles((d) => ({ ...d, [u.id]: e.target.value }))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </td>
                <td style={td}>
                  <Input
                    type="number"
                    min={1}
                    disabled={!COOP_ROLES.has(draftRoles[u.id] ?? u.role)}
                    value={draftCoops[u.id] ?? ""}
                    onChange={(e) => setDraftCoops((d) => ({ ...d, [u.id]: e.target.value }))}
                    style={{ width: 72 }}
                  />
                </td>
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={draftActive[u.id] ?? u.is_active}
                    onChange={(e) => setDraftActive((d) => ({ ...d, [u.id]: e.target.checked }))}
                  />
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button type="button" disabled={busy === u.id} onClick={() => void save(u.id)}>
                      {busy === u.id ? "…" : "ذخیره"}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy === u.id} onClick={() => void remove(u.id)}>
                      حذف
                    </Button>
                  </div>
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
