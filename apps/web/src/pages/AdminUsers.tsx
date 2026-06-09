import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MobileSheet } from "../components/MobileSheet";
import { PageFrame } from "../components/PageFrame";
import { FormField } from "../components/FormField";
import { apiDeleteData, apiGetData, apiPatchData, apiPostData } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import {
  iranIban,
  nationalId,
  optionalPersianName,
  positiveInt,
  provisioningMobile,
  required,
  runValidators,
} from "../lib/validation";
import { ADMIN_CREATE_HINT_FA } from "../lib/identityFieldRules";
import { ADMIN_USER_ROLES, roleLabelFa, roleOptionsFa } from "../lib/roleLabels";
import { Alert, Button, Card, FormRow, FilterField, Input, Select } from "../components/ui";

type AdminUser = {
  id: number;
  mobile_number: string;
  national_id?: string;
  bank_iban?: string;
  village_id?: number;
  village_name?: string;
  full_name?: string;
  role: string;
  cooperative_id?: number;
  cooperative_name?: string;
  mine_id?: number;
  mine_code?: string;
  mine_name?: string;
  is_active: boolean;
};

type VillageRow = { id: number; name: string; mine_id: number };
type MineCatalogRow = {
  id: number;
  mine_code: string;
  name: string;
  cooperatives: { id: number; name: string; mine_id: number }[];
  villages: VillageRow[];
};

const GLOBAL_ROLES = new Set(["ADMIN", "OPERATION_ADMIN"]);
const COOP_ID_REQUIRED = new Set(["COOP_ADMIN", "COOP_OPERATOR", "COOP", "HOUSEHOLD"]);
const COOP_ID_OPTIONAL = new Set(["DRIVER", "FLEET_OWNER"]);
const ROLE_OPTIONS = roleOptionsFa(ADMIN_USER_ROLES);

function needsMine(role: string) {
  return !GLOBAL_ROLES.has(role);
}

function needsCooperative(role: string, requiredOnly = false) {
  if (COOP_ID_REQUIRED.has(role)) return true;
  if (!requiredOnly && COOP_ID_OPTIONAL.has(role)) return true;
  return false;
}

function needsScopedProfile(role: string) {
  return needsMine(role);
}

function buildUsersQuery(filters: {
  mine: string;
  coop: string;
  village: string;
  role: string;
  q: string;
}) {
  const p = new URLSearchParams();
  if (filters.mine) p.set("mine_id", filters.mine);
  if (filters.coop) p.set("cooperative_id", filters.coop);
  if (filters.village) p.set("village_id", filters.village);
  if (filters.role) p.set("role", filters.role);
  if (filters.q.trim()) p.set("q", filters.q.trim());
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function AdminUsers() {
  const { me } = useAuthMe();
  const isMobile = useMediaQuery("(max-width: 900px)");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mines, setMines] = useState<MineCatalogRow[]>([]);
  const [minesLoaded, setMinesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  const [filterMine, setFilterMine] = useState("");
  const [filterCoop, setFilterCoop] = useState("");
  const [filterVillage, setFilterVillage] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterQ, setFilterQ] = useState("");

  const [draftRoles, setDraftRoles] = useState<Record<number, string>>({});
  const [draftCoops, setDraftCoops] = useState<Record<number, string>>({});
  const [draftMines, setDraftMines] = useState<Record<number, string>>({});
  const [draftVillages, setDraftVillages] = useState<Record<number, string>>({});
  const [draftNat, setDraftNat] = useState<Record<number, string>>({});
  const [draftIban, setDraftIban] = useState<Record<number, string>>({});
  const [draftActive, setDraftActive] = useState<Record<number, boolean>>({});

  const [newMobile, setNewMobile] = useState("");
  const [newNationalId, setNewNationalId] = useState("");
  const [newIban, setNewIban] = useState("");
  const [newRole, setNewRole] = useState("EMPLOYER");
  const [newMine, setNewMine] = useState("");
  const [newCoop, setNewCoop] = useState("");
  const [newVillage, setNewVillage] = useState("");
  const [newName, setNewName] = useState("");

  const loadMines = useCallback(async () => {
    const res = await apiGetData<{ mines: MineCatalogRow[] }>("/admin/mines");
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      setMinesLoaded(true);
      return;
    }
    setMines(res.data.mines);
    setNewMine((prev) => prev || (res.data.mines[0] ? String(res.data.mines[0].id) : ""));
    setMinesLoaded(true);
  }, []);

  const cooperativesForMine = useCallback(
    (mineId: string) => {
      const mine = mines.find((m) => String(m.id) === mineId);
      return mine?.cooperatives ?? [];
    },
    [mines],
  );

  const villagesForMine = useCallback(
    (mineId: string) => {
      const mine = mines.find((m) => String(m.id) === mineId);
      return mine?.villages ?? [];
    },
    [mines],
  );

  const load = useCallback(async () => {
    const qs = buildUsersQuery({
      mine: filterMine,
      coop: filterCoop,
      village: filterVillage,
      role: filterRole,
      q: filterQ,
    });
    const res = await apiGetData<{ users: AdminUser[] }>(`/admin/users${qs}`);
    if (!res.ok) {
      setError(apiErrorMessageFa(res.code, res.message));
      return;
    }
    setError(null);
    setUsers(res.data.users);
    const roles: Record<number, string> = {};
    const coops: Record<number, string> = {};
    const mineDraft: Record<number, string> = {};
    const villages: Record<number, string> = {};
    const nat: Record<number, string> = {};
    const iban: Record<number, string> = {};
    const active: Record<number, boolean> = {};
    for (const u of res.data.users) {
      roles[u.id] = u.role;
      coops[u.id] = u.cooperative_id != null ? String(u.cooperative_id) : "";
      mineDraft[u.id] = u.mine_id != null ? String(u.mine_id) : mines[0] ? String(mines[0].id) : "";
      villages[u.id] = u.village_id != null ? String(u.village_id) : "";
      nat[u.id] = u.national_id ?? "";
      iban[u.id] = u.bank_iban ?? "";
      active[u.id] = u.is_active;
    }
    setDraftRoles(roles);
    setDraftCoops(coops);
    setDraftMines(mineDraft);
    setDraftVillages(villages);
    setDraftNat(nat);
    setDraftIban(iban);
    setDraftActive(active);
  }, [filterMine, filterCoop, filterVillage, filterRole, filterQ, mines]);

  useEffect(() => {
    void loadMines();
  }, [loadMines, me?.mine_id]);

  useEffect(() => {
    void load();
  }, [load, me?.mine_id]);

  const newCoops = useMemo(() => cooperativesForMine(newMine), [cooperativesForMine, newMine]);
  const newVillages = useMemo(() => villagesForMine(newMine), [villagesForMine, newMine]);
  const filterCoops = useMemo(() => cooperativesForMine(filterMine), [cooperativesForMine, filterMine]);
  const filterVillages = useMemo(() => villagesForMine(filterMine), [villagesForMine, filterMine]);

  useEffect(() => {
    if (newCoops.length > 0 && !newCoops.some((c) => String(c.id) === newCoop)) {
      setNewCoop(String(newCoops[0]!.id));
    }
  }, [newCoops, newCoop, newMine]);

  useEffect(() => {
    if (newVillages.length > 0 && !newVillages.some((v) => String(v.id) === newVillage)) {
      setNewVillage(String(newVillages[0]!.id));
    }
  }, [newVillages, newVillage, newMine]);

  function validateMineCoop(role: string, mineId: string, coopId: string): string | null {
    if (!needsMine(role)) return null;
    const mineErr = positiveInt("معدن")(mineId);
    if (mineErr) return mineErr;
    if (COOP_ID_REQUIRED.has(role)) {
      const coopErr = positiveInt("تعاونی")(coopId);
      if (coopErr) return coopErr;
    }
    return null;
  }

  function validateScopedFields(
    role: string,
    nationalIdVal: string,
    ibanVal: string,
    villageId: string,
    mineId: string,
    coopId: string,
  ): string | null {
    const scopeErr = validateMineCoop(role, mineId, coopId);
    if (scopeErr) return scopeErr;
    if (!needsScopedProfile(role)) return null;
    const natErr = runValidators(nationalIdVal, [required("کد ملی"), nationalId()]);
    if (natErr) return natErr;
    const ibanErr = runValidators(ibanVal, [required("شماره شبا"), iranIban()]);
    if (ibanErr) return ibanErr;
    const villageErr = positiveInt("روستا")(villageId);
    if (villageErr) return villageErr;
    return null;
  }

  async function save(userId: number) {
    const role = draftRoles[userId];
    if (!role) return;
    setBusy(userId);
    const mineId = draftMines[userId] ?? "";
    const coopId = draftCoops[userId] ?? "";
    const villageId = draftVillages[userId] ?? "";
    const validationErr = validateScopedFields(
      role,
      draftNat[userId] ?? "",
      draftIban[userId] ?? "",
      villageId,
      mineId,
      coopId,
    );
    if (validationErr) {
      setError(validationErr);
      setBusy(null);
      return;
    }

    const body: Record<string, unknown> = {
      role,
      is_active: draftActive[userId],
      national_id: draftNat[userId]?.trim() || null,
    };

    if (needsMine(role)) {
      body.mine_id = Number(mineId);
      body.cooperative_id = needsCooperative(role) && coopId ? Number(coopId) : null;
      if (needsScopedProfile(role)) {
        body.bank_iban = draftIban[userId]?.trim();
        body.village_id = villageId ? Number(villageId) : null;
      }
    } else {
      body.cooperative_id = null;
      body.mine_id = null;
      body.bank_iban = null;
      body.village_id = null;
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
    const mobileErr = runValidators(newMobile, [provisioningMobile()]);
    const nameErr = runValidators(newName, [optionalPersianName("نام")]);
    const scopeErr = validateScopedFields(newRole, newNationalId, newIban, newVillage, newMine, newCoop);
    if (mobileErr || nameErr || scopeErr) {
      setError(mobileErr ?? nameErr ?? scopeErr ?? null);
      return;
    }
    setBusy(-1);
    const body: Record<string, unknown> = {
      mobile_number: newMobile.trim(),
      role: newRole,
      full_name: newName.trim() || undefined,
      is_active: true,
    };
    if (needsScopedProfile(newRole)) {
      body.national_id = newNationalId.trim();
      body.bank_iban = newIban.trim();
      body.village_id = Number(newVillage);
    } else if (newNationalId.trim()) {
      body.national_id = newNationalId.trim();
    }
    if (needsMine(newRole)) {
      body.mine_id = Number(newMine);
      if (needsCooperative(newRole) && newCoop) {
        body.cooperative_id = Number(newCoop);
      }
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
    setNewIban("");
    setNewName("");
    setNewCoop("");
    setNewVillage("");
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
      intro="ایجاد و ویرایش کاربر با نقش، معدن، تعاونی، روستا، کد ملی و شبا. فیلترها بر اساس محدوده معدن/تعاونی/روستا/نقش کار می‌کنند."
    >
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "بستن فرم" : "کاربر جدید"}
        </Button>
        <Link to="/panel/admin/user-requests" style={{ alignSelf: "center", fontSize: 13 }}>
          صندوق درخواست‌ها
        </Link>
        <Link to="/panel/admin/mine-onboard" style={{ alignSelf: "center", fontSize: 13 }}>
          ثبت معدن جدید
        </Link>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <FormRow>
          <FilterField minWidth={140}>
            <FormField label="فیلتر معدن">
              <Select
                value={filterMine}
                onChange={(e) => {
                  setFilterMine(e.target.value);
                  setFilterCoop("");
                  setFilterVillage("");
                }}
              >
                <option value="">همه</option>
                {mines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر تعاونی">
              <Select value={filterCoop} onChange={(e) => setFilterCoop(e.target.value)} disabled={!filterMine}>
                <option value="">همه</option>
                {filterCoops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر روستا">
              <Select value={filterVillage} onChange={(e) => setFilterVillage(e.target.value)} disabled={!filterMine}>
                <option value="">همه</option>
                {filterVillages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر نقش">
              <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="">همه</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={160}>
            <FormField label="جستجو">
              <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="موبایل، کد ملی، شبا…" />
            </FormField>
          </FilterField>
          <FilterField minWidth={80}>
            <FormField label=" ">
              <Button type="button" onClick={() => void load()}>
                اعمال
              </Button>
            </FormField>
          </FilterField>
        </FormRow>
      </Card>

      {minesLoaded && mines.length === 0 && (
        <Alert variant="warn">
          هنوز معدنی ثبت نشده. از{" "}
          <Link to="/panel/admin/mine-onboard">ثبت معدن جدید</Link> شروع کنید، سپس کاربر اضافه کنید.
        </Alert>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280" }}>{ADMIN_CREATE_HINT_FA}</p>
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
            <FilterField minWidth={120}>
              <FormField label="نقش">
                <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </FilterField>
            {needsMine(newRole) && (
              <>
                <FilterField minWidth={160}>
                  <FormField label="معدن" required>
                    <Select value={newMine} onChange={(e) => setNewMine(e.target.value)}>
                      {mines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.mine_code})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </FilterField>
                {needsCooperative(newRole) && (
                  <FilterField minWidth={160}>
                    <FormField label="تعاونی" required={COOP_ID_REQUIRED.has(newRole)}>
                      <Select value={newCoop} onChange={(e) => setNewCoop(e.target.value)}>
                        {newCoops.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </FilterField>
                )}
              </>
            )}
            {needsScopedProfile(newRole) && (
              <>
                <FilterField minWidth={140}>
                  <FormField label="کد ملی" required>
                    <Input value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} />
                  </FormField>
                </FilterField>
                <FilterField minWidth={180}>
                  <FormField label="شماره شبا" required>
                    <Input value={newIban} onChange={(e) => setNewIban(e.target.value)} placeholder="IR…" />
                  </FormField>
                </FilterField>
                <FilterField minWidth={140}>
                  <FormField label="روستا" required>
                    <Select value={newVillage} onChange={(e) => setNewVillage(e.target.value)}>
                      {newVillages.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </FilterField>
              </>
            )}
            {!needsScopedProfile(newRole) && (
              <FilterField minWidth={140}>
                <FormField label="کد ملی (اختیاری)">
                  <Input value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} />
                </FormField>
              </FilterField>
            )}
            <FilterField minWidth={140}>
              <FormField label="نام (فارسی، اختیاری)">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </FormField>
            </FilterField>
          </FormRow>
        </Card>
      )}

      {isMobile ? (
        <div className="admin-users-mobile">
          {users.length === 0 ? (
            <p style={{ color: "#6B7280", fontSize: 14 }}>کاربری یافت نشد.</p>
          ) : (
            users.map((u) => {
              const role = draftRoles[u.id] ?? u.role;
              return (
                <div
                  key={u.id}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{u.mobile_number}</div>
                  <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                    <div>{roleLabelFa(role)}</div>
                    <div>{u.full_name ?? "—"}</div>
                    <div>{u.mine_name ?? "—"}</div>
                  </div>
                  <Button type="button" style={{ marginTop: 10, width: "100%" }} onClick={() => setEditUserId(u.id)}>
                    ویرایش
                  </Button>
                </div>
              );
            })
          )}
        </div>
      ) : (
      <div className="table-scroll-hint admin-users-desktop">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" }}>
              <th style={th}>موبایل</th>
              <th style={th}>کد ملی</th>
              <th style={th}>شبا</th>
              <th style={th}>نام</th>
              <th style={th}>نقش</th>
              <th style={th}>معدن</th>
              <th style={th}>تعاونی</th>
              <th style={th}>روستا</th>
              <th style={th}>فعال</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = draftRoles[u.id] ?? u.role;
              const rowCoops = cooperativesForMine(draftMines[u.id] ?? "");
              const rowVillages = villagesForMine(draftMines[u.id] ?? "");
              const scoped = needsScopedProfile(role);
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={td}>{u.mobile_number}</td>
                  <td style={td}>
                    <Input
                      value={draftNat[u.id] ?? ""}
                      onChange={(e) => setDraftNat((d) => ({ ...d, [u.id]: e.target.value }))}
                    />
                  </td>
                  <td style={td}>
                    <Input
                      value={draftIban[u.id] ?? ""}
                      disabled={!scoped}
                      onChange={(e) => setDraftIban((d) => ({ ...d, [u.id]: e.target.value }))}
                    />
                  </td>
                  <td style={td}>{u.full_name ?? "—"}</td>
                  <td style={td}>
                    <Select
                      value={role}
                      onChange={(e) => setDraftRoles((d) => ({ ...d, [u.id]: e.target.value }))}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td style={td}>
                    <div>{u.mine_name ?? "—"}</div>
                    <Select
                      value={draftMines[u.id] ?? ""}
                      disabled={!needsMine(role)}
                      onChange={(e) => setDraftMines((d) => ({ ...d, [u.id]: e.target.value }))}
                    >
                      {mines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.mine_code}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td style={td}>
                    <div>{u.cooperative_name ?? "—"}</div>
                    <Select
                      disabled={!needsCooperative(role)}
                      value={draftCoops[u.id] ?? ""}
                      onChange={(e) => setDraftCoops((d) => ({ ...d, [u.id]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {rowCoops.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td style={td}>
                    <div>{u.village_name ?? "—"}</div>
                    <Select
                      disabled={!scoped}
                      value={draftVillages[u.id] ?? ""}
                      onChange={(e) => setDraftVillages((d) => ({ ...d, [u.id]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {rowVillages.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
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
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy === u.id}
                        onClick={() => void remove(u.id)}
                      >
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {editUserId != null && (() => {
        const u = users.find((x) => x.id === editUserId);
        if (!u) return null;
        const role = draftRoles[u.id] ?? u.role;
        const rowCoops = cooperativesForMine(draftMines[u.id] ?? "");
        const rowVillages = villagesForMine(draftMines[u.id] ?? "");
        const scoped = needsScopedProfile(role);
        return (
          <MobileSheet
            title={`ویرایش ${u.mobile_number}`}
            open
            onClose={() => setEditUserId(null)}
            footer={
              <>
                <Button type="button" disabled={busy === u.id} onClick={() => void save(u.id).then(() => setEditUserId(null))}>
                  {busy === u.id ? "…" : "ذخیره"}
                </Button>
                <Button type="button" variant="secondary" disabled={busy === u.id} onClick={() => void remove(u.id)}>
                  حذف
                </Button>
              </>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FormField label="نقش">
                <Select value={role} onChange={(e) => setDraftRoles((d) => ({ ...d, [u.id]: e.target.value }))}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="کد ملی">
                <Input value={draftNat[u.id] ?? ""} onChange={(e) => setDraftNat((d) => ({ ...d, [u.id]: e.target.value }))} />
              </FormField>
              {scoped && (
                <>
                  <FormField label="شبا">
                    <Input value={draftIban[u.id] ?? ""} onChange={(e) => setDraftIban((d) => ({ ...d, [u.id]: e.target.value }))} />
                  </FormField>
                  <FormField label="روستا">
                    <Select value={draftVillages[u.id] ?? ""} onChange={(e) => setDraftVillages((d) => ({ ...d, [u.id]: e.target.value }))}>
                      <option value="">—</option>
                      {rowVillages.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </>
              )}
              {needsMine(role) && (
                <>
                  <FormField label="معدن">
                    <Select value={draftMines[u.id] ?? ""} onChange={(e) => setDraftMines((d) => ({ ...d, [u.id]: e.target.value }))}>
                      {mines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  {needsCooperative(role) && (
                    <FormField label="تعاونی">
                      <Select value={draftCoops[u.id] ?? ""} onChange={(e) => setDraftCoops((d) => ({ ...d, [u.id]: e.target.value }))}>
                        <option value="">—</option>
                        {rowCoops.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}
                </>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={draftActive[u.id] ?? u.is_active}
                  onChange={(e) => setDraftActive((d) => ({ ...d, [u.id]: e.target.checked }))}
                />
                فعال
              </label>
            </div>
          </MobileSheet>
        );
      })()}
    </PageFrame>
  );
}

const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 8px" };
