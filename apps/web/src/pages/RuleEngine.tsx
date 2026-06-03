import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { FormField, fieldErrorStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostData } from "../api";
import { formatJalaliDate } from "../lib/jalaliDate";
import { labelFa, RULE_SCOPE_FA, RULE_STATUS_FA } from "../lib/uiLabels";
import { dateRequired, positiveInt, positiveNumber, required } from "../lib/validation";
import { Alert, Button, FilterBar, FilterField, FormRow, Section, Select } from "../components/ui";
import { brand, selectStyle, tableTdStyle, tableThStyle } from "../theme";

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
  const { getError, validateAll, validateField } = useFieldValidation();

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
    const schema: Record<string, { value: string; validators: import("../lib/validation").FieldValidator[] }> = {
      value: { value, validators: [required("مقدار"), positiveNumber("مقدار")] },
      effectiveFrom: { value: effectiveFrom, validators: [dateRequired("تاریخ اعتبار")] },
    };
    if (scopeType === "MINE") schema.mineId = { value: mineId, validators: [positiveInt("mine_id")] };
    if (scopeType === "COOPERATIVE") schema.coopId = { value: coopId, validators: [positiveInt("cooperative_id")] };
    if (!validateAll(schema)) return;

    const num = Number(value);
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
      title="قوانین مالی"
      intro="قوانین نسخه‌دار: سهم مالک، آستانه باسکول، دوره تسویه — فقط مدیر سیستم."
    >
      {err && <Alert variant="danger">{err}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      <FormRow
        as="form"
        noValidate
        onSubmit={submit}
        actions={
          <Button type="submit" disabled={busy}>
            {busy ? "…" : "فعال‌سازی نسخه جدید"}
          </Button>
        }
      >
        <FilterField minWidth={160}>
          <FormField label="کلید" htmlFor="rule-key">
            <Select id="rule-key" value={key} onChange={(e) => setKey(e.target.value)} style={selectStyle}>
              {(knownKeys.length ? knownKeys : [key]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </FormField>
        </FilterField>
        <FilterField minWidth={120}>
          <FormField label="مقدار" required error={getError("value")}>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                validateField("value", e.target.value, [required("مقدار"), positiveNumber("مقدار")]);
              }}
              onBlur={() => validateField("value", value, [required("مقدار"), positiveNumber("مقدار")])}
              style={selectStyle}
            />
          </FormField>
        </FilterField>
        <FilterField minWidth={140}>
          <FormField label="محدوده" htmlFor="rule-scope">
            <Select
              id="rule-scope"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as typeof scopeType)}
              style={selectStyle}
            >
              <option value="GLOBAL">{labelFa(RULE_SCOPE_FA, "GLOBAL")}</option>
              <option value="MINE">{labelFa(RULE_SCOPE_FA, "MINE")}</option>
              <option value="COOPERATIVE">{labelFa(RULE_SCOPE_FA, "COOPERATIVE")}</option>
            </Select>
          </FormField>
        </FilterField>
        {scopeType === "MINE" && (
          <FilterField minWidth={120}>
            <FormField label="شناسه معدن" required error={getError("mineId")}>
              <input
                value={mineId}
                onChange={(e) => {
                  setMineId(e.target.value);
                  validateField("mineId", e.target.value, [positiveInt("mine_id")]);
                }}
                onBlur={() => validateField("mineId", mineId, [positiveInt("mine_id")])}
                style={selectStyle}
              />
            </FormField>
          </FilterField>
        )}
        {scopeType === "COOPERATIVE" && (
          <FilterField minWidth={120}>
            <FormField label="شناسه تعاونی" required error={getError("coopId")}>
              <input
                value={coopId}
                onChange={(e) => {
                  setCoopId(e.target.value);
                  validateField("coopId", e.target.value, [positiveInt("cooperative_id")]);
                }}
                onBlur={() => validateField("coopId", coopId, [positiveInt("cooperative_id")])}
                style={selectStyle}
              />
            </FormField>
          </FilterField>
        )}
        <FilterField minWidth={180}>
          <JalaliDatePicker
            label="اعتبار از"
            value={effectiveFrom}
            onChange={(v) => {
              setEffectiveFrom(v);
              validateField("effectiveFrom", v, [dateRequired("تاریخ اعتبار")]);
            }}
          />
          {getError("effectiveFrom") && <span style={fieldErrorStyle}>{getError("effectiveFrom")}</span>}
        </FilterField>
      </FormRow>

      <Section title="فهرست قوانین">
        <FilterBar style={{ marginBottom: 16 }}>
          <FilterField minWidth={160}>
            <FormField label="فیلتر وضعیت" htmlFor="rule-filter-status">
              <Select
                id="rule-filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                style={selectStyle}
              >
                <option value="">همه</option>
                <option value="ACTIVE">{labelFa(RULE_STATUS_FA, "ACTIVE")}</option>
                <option value="ARCHIVED">{labelFa(RULE_STATUS_FA, "ARCHIVED")}</option>
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth="auto">
            <Button variant="secondary" onClick={() => void load()}>
              بروزرسانی
            </Button>
          </FilterField>
        </FilterBar>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={tableThStyle}>کلید</th>
                <th style={tableThStyle}>مقدار</th>
                <th style={tableThStyle}>محدوده</th>
                <th style={tableThStyle}>نسخه</th>
                <th style={tableThStyle}>وضعیت</th>
                <th style={tableThStyle}>از</th>
                <th style={tableThStyle}>تا</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={tableTdStyle}>{r.key}</td>
                  <td style={tableTdStyle}>{formatValue(r.value)}</td>
                  <td style={tableTdStyle}>
                    {labelFa(RULE_SCOPE_FA, r.scope_type)}
                    {r.mine_id != null ? ` · معدن ${r.mine_id.toLocaleString("fa-IR")}` : ""}
                    {r.cooperative_id != null ? ` · تعاونی ${r.cooperative_id.toLocaleString("fa-IR")}` : ""}
                  </td>
                  <td style={tableTdStyle}>{r.version.toLocaleString("fa-IR")}</td>
                  <td style={tableTdStyle}>{labelFa(RULE_STATUS_FA, r.status)}</td>
                  <td style={tableTdStyle}>{formatJalaliDate(r.effective_from)}</td>
                  <td style={tableTdStyle}>{r.effective_to ? formatJalaliDate(r.effective_to) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </PageFrame>
  );
}
