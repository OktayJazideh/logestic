import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { fieldErrorStyle } from "../components/FormField";
import { minLength, required, runValidators } from "../lib/validation";
import { apiGetData, apiPostData } from "../api";
import { useAuthMe } from "../hooks/useAuthMe";

type Member = {
  household_id: number;
  head_name: string;
  village_id: number;
  status: string;
};

type Obj = {
  id: number;
  household_id: number;
  reporter_user_id: number;
  reporter_mobile?: string;
  reason: string;
  status: string;
};

type ObjectionForm = {
  reason: string;
};

const emptyForm = (): ObjectionForm => ({ reason: "" });

function canCreateObjection(role: string | undefined) {
  return role === "HOUSEHOLD" || role === "COOP_ADMIN" || role === "ADMIN";
}

function canReviewObjections(role: string | undefined) {
  return role === "COOP_ADMIN" || role === "ADMIN";
}

function reporterLabel(o: Obj): string {
  const mobile = o.reporter_mobile?.trim();
  if (mobile) return mobile;
  return `کاربر #${o.reporter_user_id}`;
}

export default function MembersTransparencyPage() {
  const { me } = useAuthMe();
  const [members, setMembers] = useState<Member[]>([]);
  const [objections, setObjections] = useState<Obj[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openFormId, setOpenFormId] = useState<number | null>(null);
  const [forms, setForms] = useState<Record<number, ObjectionForm>>({});
  const [trackingCode, setTrackingCode] = useState<number | null>(null);
  const [resolveReasons, setResolveReasons] = useState<Record<number, string>>({});

  const loadObjections = useCallback(async () => {
    if (!canReviewObjections(me?.role)) return;
    const r = await apiGetData<{ objections: Obj[] }>("/coop/objections");
    if (r.ok) setObjections(r.data.objections);
  }, [me?.role]);

  const load = useCallback(async () => {
    setErr(null);
    const membersRes = await apiGetData<{ members: Member[] }>("/coop/members");
    if (!membersRes.ok) {
      setErr(membersRes.message);
      return;
    }
    setMembers(membersRes.data.members);
    await loadObjections();
  }, [loadObjections]);

  useEffect(() => {
    load();
  }, [load]);

  function getForm(householdId: number): ObjectionForm {
    return forms[householdId] ?? emptyForm();
  }

  function setFormField(householdId: number, field: keyof ObjectionForm, value: string) {
    setForms((prev) => ({
      ...prev,
      [householdId]: { ...(prev[householdId] ?? emptyForm()), [field]: value },
    }));
  }

  async function submitObjection(member: Member) {
    const form = getForm(member.household_id);
    const reason = form.reason.trim();
    if (reason.length < 3) {
      setErr("دلیل اعتراض حداقل ۳ کاراکتر است.");
      return;
    }
    setBusy(`create-${member.household_id}`);
    setErr(null);
    const r = await apiPostData<{ objection: Obj }>("/coop/objections", {
      household_id: member.household_id,
      reason,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setTrackingCode(r.data.objection.id);
    setOpenFormId(null);
    setForms((prev) => {
      const next = { ...prev };
      delete next[member.household_id];
      return next;
    });
    await loadObjections();
  }

  async function resolveObjection(id: number, status: "RESOLVED" | "REJECTED") {
    const reason = resolveReasons[id]?.trim() ?? "";
    if (reason.length < 3) {
      setErr("برای رسیدگی، دلیل حداقل ۳ کاراکتر وارد کنید.");
      return;
    }
    setBusy(`resolve-${id}-${status}`);
    setErr(null);
    const r = await apiPostData<{ objection: Obj }>(`/coop/objections/${id}/resolve`, { status, reason });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setResolveReasons((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await loadObjections();
  }

  const openObjections = objections.filter((o) => o.status === "PENDING");
  const showCreate = canCreateObjection(me?.role);
  const showReview = canReviewObjections(me?.role);

  return (
    <PageFrame
      title="شفافیت اعضا و اعتراض"
      expectedRoles={["COOP_ADMIN", "COOP_OPERATOR", "ADMIN", "CONSULTANT", "HOUSEHOLD"]}
    >
      <p style={{ color: "#6B7280", marginTop: 0 }}>
        نمایش محدود اعضا (نام سرپرست، روستا، وضعیت)؛ ثبت اعتراض با کد پیگیری؛ گزارش‌دهنده فقط از حساب
        احرازشده (session) — بدون ثبت ناشناس.
      </p>
      {err && <Alert tone="err">{err}</Alert>}
      {trackingCode != null && (
        <Alert tone="ok">
          اعتراض ثبت شد. <strong>کد پیگیری: {trackingCode}</strong> — این کد را نگه دارید.
          <button type="button" onClick={() => setTrackingCode(null)} style={dismissBtn}>
            بستن
          </button>
        </Alert>
      )}

      <h3 style={h3}>اعضای تایید/درحال بررسی</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
            <th style={th}>سرپرست</th>
            <th style={th}>روستا</th>
            <th style={th}>وضعیت</th>
            {showCreate && <th style={th}>اعتراض</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <React.Fragment key={m.household_id}>
              <tr>
                <td style={td}>{m.head_name}</td>
                <td style={td}>{m.village_id}</td>
                <td style={td}>{m.status}</td>
                {showCreate && (
                  <td style={td}>
                    <button
                      type="button"
                      style={btnSecondary}
                      disabled={busy != null}
                      onClick={() =>
                        setOpenFormId((cur) => (cur === m.household_id ? null : m.household_id))
                      }
                    >
                      {openFormId === m.household_id ? "انصراف" : "ثبت اعتراض"}
                    </button>
                  </td>
                )}
              </tr>
              {showCreate && openFormId === m.household_id && (
                <tr>
                  <td colSpan={4} style={{ ...td, background: "#F9FAFB" }}>
                    <ObjectionFormPanel
                      form={getForm(m.household_id)}
                      busy={busy === `create-${m.household_id}`}
                      onChange={(field, value) => setFormField(m.household_id, field, value)}
                      onSubmit={() => submitObjection(m)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {showReview && (
        <>
          <h3 style={h3}>بررسی اعتراض‌ها</h3>
          <p style={{ color: "#6B7280", fontSize: 12, marginTop: 0 }}>
            فقط اعتراض‌های باز (در انتظار). گزارش‌دهنده از session (موبایل/شناسه کاربر) — هر اقدام با دلیل در
            audit ثبت می‌شود.
          </p>
          {openObjections.length === 0 && (
            <p style={{ color: "#6B7280", fontSize: 13 }}>اعتراض بازی برای رسیدگی نیست.</p>
          )}
          {openObjections.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                  <th style={th}>کد</th>
                  <th style={th}>خانوار</th>
                  <th style={th}>گزارش‌دهنده (session)</th>
                  <th style={th}>دلیل اعتراض</th>
                  <th style={th}>دلیل رسیدگی</th>
                  <th style={th}>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {openObjections.map((o) => (
                  <tr key={o.id}>
                    <td style={td}>{o.id}</td>
                    <td style={td}>{o.household_id}</td>
                    <td style={td}>
                      {reporterLabel(o)}
                      <div style={{ color: "#6B7280", fontSize: 11 }}>user_id: {o.reporter_user_id}</div>
                    </td>
                    <td style={td}>{o.reason}</td>
                    <td style={td}>
                      <input
                        type="text"
                        placeholder="دلیل رسیدگی…"
                        value={resolveReasons[o.id] ?? ""}
                        onChange={(e) =>
                          setResolveReasons((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        style={inputStyle}
                      />
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={btnOk}
                          disabled={busy != null}
                          onClick={() => resolveObjection(o.id, "RESOLVED")}
                        >
                          {busy === `resolve-${o.id}-RESOLVED` ? "…" : "معتبر"}
                        </button>
                        <button
                          type="button"
                          style={btnDanger}
                          disabled={busy != null}
                          onClick={() => resolveObjection(o.id, "REJECTED")}
                        >
                          {busy === `resolve-${o.id}-REJECTED` ? "…" : "رد"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={h3}>همهٔ اعتراض‌های ثبت‌شده</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>کد پیگیری</th>
                <th style={th}>خانوار</th>
                <th style={th}>گزارش‌دهنده</th>
                <th style={th}>وضعیت</th>
                <th style={th}>دلیل</th>
              </tr>
            </thead>
            <tbody>
              {objections.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{o.id}</td>
                  <td style={td}>{o.household_id}</td>
                  <td style={td}>
                    {reporterLabel(o)}
                    <span style={{ color: "#6B7280" }}> — #{o.reporter_user_id}</span>
                  </td>
                  <td style={td}>{o.status}</td>
                  <td style={td}>{o.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PageFrame>
  );
}

function ObjectionFormPanel({
  form,
  busy,
  fieldError,
  onChange,
  onSubmit,
  onValidate,
}: {
  form: ObjectionForm;
  busy: boolean;
  fieldError?: string;
  onChange: (field: keyof ObjectionForm, value: string) => void;
  onSubmit: () => void;
  onValidate?: (reason: string) => void;
}) {
  const reasonErr =
    fieldError ??
    (form.reason.trim() ? runValidators(form.reason, [minLength(3, "دلیل اعتراض")]) : undefined);

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
        گزارش‌دهنده به‌صورت خودکار از حساب واردشده (session) ثبت می‌شود — امکان ثبت ناشناس یا جعل هویت در
        فرم وجود ندارد.
      </p>
      <label style={labelStyle}>
        دلیل اعتراض <span style={{ color: "#B45309" }}>*</span>
        <textarea
          value={form.reason}
          onChange={(e) => {
            onChange("reason", e.target.value);
            onValidate?.(e.target.value);
          }}
          onBlur={() => onValidate?.(form.reason)}
          rows={3}
          style={{
            ...inputStyle,
            resize: "vertical",
            borderColor: reasonErr ? "#DC2626" : "#E5E7EB",
          }}
        />
        {reasonErr && (
          <div role="alert" style={fieldErrorStyle}>
            {reasonErr}
          </div>
        )}
      </label>
      <button
        type="button"
        style={btnPrimary}
        disabled={busy || !!runValidators(form.reason, [required("دلیل اعتراض"), minLength(3, "دلیل اعتراض")])}
        onClick={onSubmit}
      >
        {busy ? "در حال ثبت…" : "ارسال اعتراض"}
      </button>
    </div>
  );
}

function Alert({ children, tone }: { children: React.ReactNode; tone?: "err" | "ok" }) {
  return (
    <div
      style={{
        color: tone === "ok" ? "#065F46" : "#B45309",
        background: tone === "ok" ? "#ECFDF5" : "#FFFBEB",
        border: `1px solid ${tone === "ok" ? "#6EE7B7" : "#FCD34D"}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 10,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

const h3: React.CSSProperties = { fontSize: 15, marginBottom: 8 };
const th: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px", verticalAlign: "top" };
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 6,
  fontSize: 12,
  boxSizing: "border-box",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12 };
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: "#0E3B13",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  justifySelf: "start",
};
const btnSecondary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
};
const btnOk: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "#166534",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "#991B1B",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const dismissBtn: React.CSSProperties = {
  marginRight: 12,
  padding: "2px 8px",
  border: "1px solid #6EE7B7",
  borderRadius: 4,
  background: "transparent",
  cursor: "pointer",
  fontSize: 11,
};
