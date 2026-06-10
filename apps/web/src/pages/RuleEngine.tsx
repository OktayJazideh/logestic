import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { FormField, fieldErrorStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { formatJalaliDate } from "../lib/jalaliDate";
import { labelFa, RULE_SCOPE_FA, RULE_STATUS_FA, ruleKeyLabelFa } from "../lib/uiLabels";
import { dateRequired, positiveInt, positiveNumber, required } from "../lib/validation";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { Alert, Button, FilterBar, FilterField, FormRow, Section, Select } from "../components/ui";
import { brand, selectStyle } from "../theme";

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

type MineCatalogRow = {
  id: number;
  mine_code: string;
  name: string;
  cooperatives: { id: number; name: string; mine_id: number }[];
};

function formatValue(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function buildRulesQuery(filters: {
  status: string;
  scopeType: string;
  mineId: string;
  coopId: string;
}) {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.scopeType) p.set("scope_type", filters.scopeType);
  if (filters.mineId) p.set("mine_id", filters.mineId);
  if (filters.coopId) p.set("cooperative_id", filters.coopId);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function RuleEnginePage() {
  const [rules, setRules] = useState<FinanceRule[]>([]);
  const [knownKeys, setKnownKeys] = useState<string[]>([]);
  const [mines, setMines] = useState<MineCatalogRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);

  const [filterStatus, setFilterStatus] = useState<"" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [filterScopeType, setFilterScopeType] = useState<"" | "GLOBAL" | "MINE" | "COOPERATIVE">("");
  const [filterMineId, setFilterMineId] = useState("");
  const [filterCoopId, setFilterCoopId] = useState("");

  const [key, setKey] = useState("split.owner");
  const [value, setValue] = useState("0.85");
  const [scopeType, setScopeType] = useState<"GLOBAL" | "MINE" | "COOPERATIVE">("GLOBAL");
  const [mineId, setMineId] = useState("");
  const [coopId, setCoopId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");
  const { getError, validateAll, validateField } = useFieldValidation();

  const loadMines = useCallback(async () => {
    const r = await apiGetData<{ mines: MineCatalogRow[] }>("/admin/mines");
    if (r.ok) {
      setMines(r.data.mines);
      setMineId((prev) => prev || (r.data.mines[0] ? String(r.data.mines[0].id) : ""));
    }
  }, []);

  const load = useCallback(async () => {
    const q = buildRulesQuery({
      status: filterStatus,
      scopeType: filterScopeType,
      mineId: filterMineId,
      coopId: filterCoopId,
    });
    const r = await apiGetData<{ rules: FinanceRule[]; known_keys: string[] }>(`/admin/rules${q}`);
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setErr(null);
    setRules(r.data.rules);
    setKnownKeys(r.data.known_keys ?? []);
  }, [filterStatus, filterScopeType, filterMineId, filterCoopId]);

  useEffect(() => {
    void loadMines();
  }, [loadMines]);

  useEffect(() => {
    void load();
  }, [load]);

  const formCoops = useMemo(() => {
    const mine = mines.find((m) => String(m.id) === mineId);
    return mine?.cooperatives ?? [];
  }, [mines, mineId]);

  const filterCoops = useMemo(() => {
    const mine = mines.find((m) => String(m.id) === filterMineId);
    return mine?.cooperatives ?? [];
  }, [mines, filterMineId]);

  useEffect(() => {
    if (formCoops.length > 0 && !formCoops.some((c) => String(c.id) === coopId)) {
      setCoopId(String(formCoops[0]!.id));
    }
  }, [formCoops, coopId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const schema: Record<string, { value: string; validators: import("../lib/validation").FieldValidator[] }> = {
      value: { value, validators: [required("مقدار"), positiveNumber("مقدار")] },
      effectiveFrom: { value: effectiveFrom, validators: [dateRequired("تاریخ اعتبار")] },
    };
    if (scopeType === "MINE") schema.mineId = { value: mineId, validators: [positiveInt("معدن")] };
    if (scopeType === "COOPERATIVE") schema.coopId = { value: coopId, validators: [positiveInt("تعاونی")] };
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
    const body: Record<string, unknown> = {
      key,
      value: num,
      scope,
      effective_from: `${effectiveFrom}T00:00:00.000Z`,
    };
    if (effectiveTo.trim()) {
      body.effective_to = `${effectiveTo}T00:00:00.000Z`;
    }
    const r = await apiPostData<{ rule: FinanceRule; archived: FinanceRule[] }>("/admin/rules", body);
    setBusy(false);
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setMsg(`قانون فعال شد (نسخه ${r.data.rule.version})؛ ${r.data.archived.length} نسخهٔ قبلی بایگانی شد.`);
    await load();
  }

  async function softDeleteRule(rule: FinanceRule) {
    const reason = window.prompt(`دلیل حذف قانون «${ruleKeyLabelFa(rule.key)}» (نسخه ${rule.version}):`);
    if (!reason?.trim()) return;
    setDeleteBusyId(rule.id);
    setErr(null);
    const r = await apiPostData<{ deleted_at: string }>("/admin/soft-delete", {
      entity_type: "finance_rule",
      entity_id: String(rule.id),
      reason: reason.trim(),
    });
    setDeleteBusyId(null);
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setMsg("قانون حذف نرم شد — سوابق در «تغییرات سیستم» باقی می‌ماند.");
    await load();
  }

  function scopeLabel(r: FinanceRule): string {
    const base = labelFa(RULE_SCOPE_FA, r.scope_type);
    if (r.mine_id != null) {
      const mine = mines.find((m) => m.id === r.mine_id);
      return `${base} · ${mine?.name ?? `معدن ${r.mine_id}`}`;
    }
    if (r.cooperative_id != null) {
      const coop = mines.flatMap((m) => m.cooperatives).find((c) => c.id === r.cooperative_id);
      return `${base} · ${coop?.name ?? `تعاونی ${r.cooperative_id}`}`;
    }
    return base;
  }

  const ruleColumns = useMemo<DataTableColumn<FinanceRule>[]>(
    () => [
      {
        key: "key",
        header: "قانون",
        render: (r) => (
          <>
            <div>{ruleKeyLabelFa(r.key)}</div>
            <div style={{ fontSize: 11, color: brand.textMuted }}>{r.key}</div>
          </>
        ),
      },
      { key: "value", header: "مقدار", render: (r) => formatValue(r.value) },
      { key: "scope", header: "محدوده", render: (r) => scopeLabel(r) },
      { key: "version", header: "نسخه", render: (r) => r.version.toLocaleString("fa-IR") },
      { key: "status", header: "وضعیت", render: (r) => labelFa(RULE_STATUS_FA, r.status) },
      { key: "from", header: "از", render: (r) => formatJalaliDate(r.effective_from) },
      {
        key: "to",
        header: "تا",
        render: (r) => (r.effective_to ? formatJalaliDate(r.effective_to) : "—"),
        cardVisible: false,
      },
      {
        key: "actions",
        header: "",
        cardVisible: false,
        render: (r) => (
          <Button
            type="button"
            variant="secondary"
            disabled={deleteBusyId === r.id}
            onClick={() => void softDeleteRule(r)}
          >
            {deleteBusyId === r.id ? "…" : "حذف نرم"}
          </Button>
        ),
      },
    ],
    [mines, deleteBusyId],
  );

  return (
    <PageFrame
      title="قوانین مالی"
      intro="قوانین نسخه‌دار با محدوده سراسری، معدن یا تعاونی. حذف نرم فقط از لیست حذف می‌کند؛ لاگ در سوابق تغییرات می‌ماند."
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
        <FilterField minWidth={200}>
          <FormField label="کلید قانون" htmlFor="rule-key">
            <Select id="rule-key" value={key} onChange={(e) => setKey(e.target.value)} style={selectStyle}>
              {(knownKeys.length ? knownKeys : [key]).map((k) => (
                <option key={k} value={k}>
                  {ruleKeyLabelFa(k)}
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
          <FilterField minWidth={160}>
            <FormField label="معدن" required error={getError("mineId")}>
              <Select
                value={mineId}
                onChange={(e) => {
                  setMineId(e.target.value);
                  validateField("mineId", e.target.value, [positiveInt("معدن")]);
                }}
                style={selectStyle}
              >
                {mines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.mine_code})
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
        )}
        {scopeType === "COOPERATIVE" && (
          <FilterField minWidth={160}>
            <FormField label="تعاونی" required error={getError("coopId")}>
              <Select
                value={coopId}
                onChange={(e) => {
                  setCoopId(e.target.value);
                  validateField("coopId", e.target.value, [positiveInt("تعاونی")]);
                }}
                style={selectStyle}
              >
                {formCoops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
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
        <FilterField minWidth={180}>
          <JalaliDatePicker
            label="انقضا (اختیاری)"
            value={effectiveTo}
            onChange={(v) => setEffectiveTo(v)}
          />
        </FilterField>
      </FormRow>

      <Section title="فهرست قوانین">
        <FilterBar style={{ marginBottom: 16 }}>
          <FilterField minWidth={140}>
            <FormField label="وضعیت" htmlFor="rule-filter-status">
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
          <FilterField minWidth={140}>
            <FormField label="محدوده">
              <Select
                value={filterScopeType}
                onChange={(e) => {
                  setFilterScopeType(e.target.value as typeof filterScopeType);
                  setFilterMineId("");
                  setFilterCoopId("");
                }}
                style={selectStyle}
              >
                <option value="">همه</option>
                <option value="GLOBAL">{labelFa(RULE_SCOPE_FA, "GLOBAL")}</option>
                <option value="MINE">{labelFa(RULE_SCOPE_FA, "MINE")}</option>
                <option value="COOPERATIVE">{labelFa(RULE_SCOPE_FA, "COOPERATIVE")}</option>
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth={140}>
            <FormField label="فیلتر معدن">
              <Select
                value={filterMineId}
                onChange={(e) => {
                  setFilterMineId(e.target.value);
                  setFilterCoopId("");
                }}
                style={selectStyle}
                disabled={filterScopeType === "GLOBAL"}
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
              <Select
                value={filterCoopId}
                onChange={(e) => setFilterCoopId(e.target.value)}
                style={selectStyle}
                disabled={!filterMineId}
              >
                <option value="">همه</option>
                {filterCoops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterField>
          <FilterField minWidth="auto">
            <Button variant="secondary" type="button" onClick={() => void load()}>
              بروزرسانی
            </Button>
          </FilterField>
        </FilterBar>

        <DataTable
          testId="rule-engine-table"
          rows={rules}
          rowKey={(r) => String(r.id)}
          columns={ruleColumns}
          emptyMessage="قانونی یافت نشد."
          cardActions={(r) => (
            <Button
              type="button"
              variant="secondary"
              disabled={deleteBusyId === r.id}
              onClick={() => void softDeleteRule(r)}
            >
              {deleteBusyId === r.id ? "…" : "حذف نرم"}
            </Button>
          )}
        />
      </Section>
    </PageFrame>
  );
}
