import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { JalaliDatePicker } from "../components/JalaliDatePicker";
import { labelFa, MATERIAL_TYPE_FA, OPERATION_TYPE_FA, RATE_CARD_STATUS_FA } from "../lib/uiLabels";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { formatJalaliDate } from "../lib/jalaliDate";
import { apiGetData, apiPostData, apiPutData } from "../api";
import { dateRequired, minLength, positiveNumber, required } from "../lib/validation";

type RateCard = {
  id: number;
  mine_id: number;
  cooperative_id?: number;
  operation_type: "TONNAGE" | "HOURLY";
  material_type: string;
  unit_type: "TON" | "HOUR";
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

type ServiceContract = {
  id: number;
  operation_type_code: string;
  unit: string;
  base_rate_rial: number;
  fixed_community_amount_rial_per_unit: number;
  contract_version: number;
  status: string;
  display_status?: "ACTIVE" | "DRAFT" | "EXPIRED";
  amendment_ref?: string;
  valid_from?: string;
  valid_to?: string;
  rate_card_id?: number;
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
  minWidth: 100,
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
const btnSmallStyle: React.CSSProperties = { ...btnStyle, padding: "4px 10px", fontSize: 12 };

function contractBadgeStyle(display: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    ACTIVE: { bg: "#ECFDF5", color: "#065F46" },
    DRAFT: { bg: "#F3F1EB", color: "#1E3A2F" },
    EXPIRED: { bg: "#F3F4F6", color: "#6B7280" },
  };
  const c = map[display] ?? map.EXPIRED;
  return {
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    background: c.bg,
    color: c.color,
  };
}

function contractDisplayStatus(c: ServiceContract): "ACTIVE" | "DRAFT" | "EXPIRED" {
  if (c.display_status) return c.display_status;
  if (c.status === "DRAFT") return "DRAFT";
  if (c.status === "ACTIVE") return "ACTIVE";
  return "EXPIRED";
}

export default function RateCards() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filterMine, setFilterMine] = useState("1");
  const [filterCoop, setFilterCoop] = useState("1");
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [mineId, setMineId] = useState("1");
  const [operationType, setOperationType] = useState<"TONNAGE" | "HOURLY">("TONNAGE");
  const [materialType, setMaterialType] = useState("ORE");
  const [unitType, setUnitType] = useState<"TON" | "HOUR">("TON");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeContract, setActiveContract] = useState<ServiceContract | null | "none">(null);
  const [contractVersions, setContractVersions] = useState<ServiceContract[]>([]);
  const [draftContractId, setDraftContractId] = useState<number | null>(null);
  const [showNewVersionForm, setShowNewVersionForm] = useState(false);
  const [nvAmendmentRef, setNvAmendmentRef] = useState("");
  const [nvValidFrom, setNvValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [nvBaseRate, setNvBaseRate] = useState("");
  const [nvCommunity, setNvCommunity] = useState("");
  const [nvRateCardId, setNvRateCardId] = useState("");

  const [scBaseRate, setScBaseRate] = useState("");
  const [scCommunity, setScCommunity] = useState("");
  const [scRateCardId, setScRateCardId] = useState("");
  const [scValidFrom, setScValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const { validateAll } = useFieldValidation();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ mine_id: filterMine, date: filterDate, include_drafts: "1" });
    const r = await apiGetData<{ rate_cards: RateCard[]; as_of: string }>(`/rate-cards?${q}`);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setErr(null);
    setCards(r.data.rate_cards);

    const sc = await apiGetData<{ service_contract: ServiceContract }>(
      `/mines/${filterMine}/service-contracts/active?operation_type=HAUL_TONNAGE&cooperative_id=${filterCoop}&date=${filterDate}`,
    );
    if (sc.ok) {
      setActiveContract(sc.data.service_contract);
    } else if (sc.code === "not_found") setActiveContract("none");
    else setActiveContract(null);

    const vers = await apiGetData<{ service_contracts: ServiceContract[] }>(
      `/mines/${filterMine}/service-contracts/versions?operation_type=HAUL_TONNAGE&cooperative_id=${filterCoop}`,
    );
    if (vers.ok) {
      setContractVersions(vers.data.service_contracts);
      const pending = vers.data.service_contracts.find((c) => contractDisplayStatus(c) === "DRAFT");
      setDraftContractId(pending?.id ?? null);
    } else {
      setContractVersions([]);
      setDraftContractId(null);
    }
  }, [filterMine, filterCoop, filterDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (operationType === "HOURLY") {
      setMaterialType("HOURLY");
      setUnitType("HOUR");
    } else {
      setMaterialType("ORE");
      setUnitType("TON");
    }
  }, [operationType]);

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll({
      rate: { value: rate, validators: [required("نرخ"), positiveNumber("نرخ")] },
      effectiveFrom: { value: effectiveFrom, validators: [dateRequired("تاریخ اعتبار")] },
    })) {
      setErr("لطفاً فیلدهای فرم را اصلاح کنید.");
      return;
    }
    const rateNum = Number(rate);
    setBusy("create");
    setErr(null);
    setMsg(null);
    const r = await apiPostData<{ rate_card: RateCard }>("/rate-cards", {
      mine_id: Number(mineId),
      operation_type: operationType,
      material_type: materialType,
      unit_type: unitType,
      rate: rateNum,
      effective_from: effectiveFrom,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(`نسخهٔ پیش‌نویس #${r.data.rate_card.id} ایجاد شد. برای اعمال، «فعال‌سازی» را بزنید.`);
    setRate("");
    await load();
  }

  async function createServiceContractDraft(e: React.FormEvent) {
    e.preventDefault();
    if (
      !validateAll({
        scBaseRate: { value: scBaseRate, validators: [required("نرخ پایه"), positiveNumber("نرخ پایه")] },
        scCommunity: { value: scCommunity, validators: [required("مبلغ جامعه"), positiveNumber("مبلغ جامعه")] },
        scValidFrom: { value: scValidFrom, validators: [dateRequired("اعتبار از")] },
      })
    ) {
      setErr("لطفاً فیلدهای قرارداد را اصلاح کنید.");
      return;
    }
    const base = Number(scBaseRate);
    const comm = Number(scCommunity);
    setBusy("sc-create");
    setErr(null);
    setMsg(null);
    const body: Record<string, unknown> = {
      cooperative_id: Number(filterCoop),
      operation_type_code: "HAUL_TONNAGE",
      unit: "TON",
      base_rate_rial: base,
      fixed_community_amount_rial_per_unit: comm,
      valid_from: new Date(scValidFrom).toISOString(),
    };
    if (scRateCardId.trim()) body.rate_card_id = Number(scRateCardId);
    const r = await apiPostData<{ service_contract: ServiceContract & { id: number } }>(
      `/mines/${filterMine}/service-contracts`,
      body,
    );
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setDraftContractId(r.data.service_contract.id);
    setMsg(`پیش‌نویس قرارداد #${r.data.service_contract.id} ایجاد شد — امضای معدن و تعاونی سپس فعال‌سازی.`);
    await load();
  }

  async function signContract(role: "mine" | "coop") {
    if (!draftContractId) {
      setErr("ابتدا پیش‌نویس قرارداد بسازید یا شناسهٔ draft را داشته باشید.");
      return;
    }
    setBusy(`sc-sign-${role}`);
    setErr(null);
    const r = await apiPutData<{ service_contract: ServiceContract }>(
      `/mines/${filterMine}/service-contracts/${draftContractId}`,
      role === "mine" ? { sign_mine: true } : { sign_coop: true },
    );
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(role === "mine" ? "امضای معدن ثبت شد." : "امضای تعاونی ثبت شد.");
  }

  async function createNewContractVersion(e: React.FormEvent) {
    e.preventDefault();
    const active =
      activeContract && activeContract !== "none" ? activeContract : contractVersions.find((c) => contractDisplayStatus(c) === "ACTIVE");
    if (!active) {
      setErr("قرارداد فعال برای الحاقیه یافت نشد.");
      return;
    }
    const base = Number(nvBaseRate);
    const comm = Number(nvCommunity);
    if (
      !validateAll({
        nvAmendmentRef: { value: nvAmendmentRef, validators: [required("شماره الحاقیه"), minLength(2, "شماره الحاقیه")] },
        nvBaseRate: { value: nvBaseRate, validators: [required("نرخ پایه"), positiveNumber("نرخ پایه")] },
        nvCommunity: { value: nvCommunity, validators: [required("مبلغ جامعه"), positiveNumber("مبلغ جامعه")] },
        nvValidFrom: { value: nvValidFrom, validators: [dateRequired("اعتبار از")] },
      })
    ) {
      setErr("لطفاً فیلدهای نسخه جدید را اصلاح کنید.");
      return;
    }
    setBusy("sc-new-version");
    setErr(null);
    setMsg(null);
    const body: Record<string, unknown> = {
      amendment_ref: nvAmendmentRef.trim(),
      valid_from: new Date(nvValidFrom).toISOString(),
      base_rate_rial: base,
      fixed_community_amount_rial_per_unit: comm,
    };
    if (nvRateCardId.trim()) body.rate_card_id = Number(nvRateCardId);
    const r = await apiPostData<{ service_contract: ServiceContract & { id: number } }>(
      `/service-contracts/${active.id}/new-version`,
      body,
    );
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setDraftContractId(r.data.service_contract.id);
    setMsg(
      `نسخهٔ ${r.data.service_contract.contract_version} (پیش‌نویس #${r.data.service_contract.id}) ثبت شد — امضا و فعال‌سازی.`,
    );
    setShowNewVersionForm(false);
    setNvAmendmentRef("");
    setNvBaseRate("");
    setNvCommunity("");
    setNvRateCardId("");
    await load();
  }

  async function activateServiceContract() {
    if (!draftContractId) {
      setErr("شناسهٔ پیش‌نویس قرارداد مشخص نیست.");
      return;
    }
    setBusy("sc-activate");
    setErr(null);
    const r = await apiPostData<{ service_contract: ServiceContract }>(
      `/mines/${filterMine}/service-contracts/${draftContractId}/activate`,
      {},
    );
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(`قرارداد #${draftContractId} فعال شد.`);
    setDraftContractId(null);
    await load();
  }

  async function activate(id: number) {
    setBusy(`act-${id}`);
    setErr(null);
    setMsg(null);
    const r = await apiPostData<{ rate_card: RateCard; archived: RateCard[] }>(`/rate-cards/${id}/activate`, {});
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    const n = r.data.archived?.length ?? 0;
    setMsg(`کارت #${id} فعال شد.${n ? ` ${n} نسخهٔ قبلی بایگانی شد.` : ""}`);
    await load();
  }

  return (
    <PageFrame
      title="کارت نرخ — نسخه‌گذاری"
      expectedRoles={["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN"]}
      intro={
        <p style={{ margin: 0 }}>
          نرخ‌های معتبر بر اساس تاریخ؛ نسخهٔ جدید ابتدا پیش‌نویس است و با فعال‌سازی، نسخهٔ فعال قبلی بایگانی
          می‌شود. تسویهٔ تنی و ساعتی از همین جدول خوانده می‌شود. سهم جامعه از{" "}
          <strong>قرارداد خدمت</strong> (مبلغ ثابت به ازای هر واحد) — مستقل از کرایه عملیاتی.
        </p>
      }
    >
      {err && <div style={alertStyle}>{err}</div>}
      {msg && <div style={okStyle}>{msg}</div>}

      {activeContract && activeContract !== "none" && (
        <div style={{ ...okStyle, marginBottom: 12 }}>
          قرارداد خدمت فعال ({labelFa(OPERATION_TYPE_FA, "HAUL_TONNAGE")}): نسخه{" "}
          {activeContract.contract_version.toLocaleString("fa-IR")} — جامعه{" "}
          {activeContract.fixed_community_amount_rial_per_unit.toLocaleString("fa-IR")} ریال/
          {activeContract.unit === "TON" ? "تن" : activeContract.unit}
        </div>
      )}

      <section style={{ marginBottom: 20, padding: 14, border: "1px solid #E5E7EB", borderRadius: 10 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15, color: "#0E3B13" }}>فیلتر نرخ‌های معتبر</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={labelStyle}>
            معدن
            <select value={filterMine} onChange={(e) => setFilterMine(e.target.value)} style={inputStyle}>
              <option value="1">معدن ۱</option>
              <option value="2">معدن ۲</option>
            </select>
          </label>
          <label style={labelStyle}>
            تعاونی
            <select value={filterCoop} onChange={(e) => setFilterCoop(e.target.value)} style={inputStyle}>
              <option value="1">تعاونی ۱</option>
              <option value="2">تعاونی ۲</option>
            </select>
          </label>
          <JalaliDatePicker label="تاریخ" value={filterDate} onChange={setFilterDate} />
          <button type="button" onClick={load} style={btnStyle}>
            بروزرسانی
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 20, padding: 14, border: "1px solid #D1FAE5", borderRadius: 10, background: "#F0FDF4" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15, color: "#0E3B13" }}>
          قرارداد خدمت ({labelFa(OPERATION_TYPE_FA, "HAUL_TONNAGE")})
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#374151" }}>
          کرایه عملیاتی از کارت نرخ لینک‌شده (یا نرخ پایه قرارداد)؛ سهم جامعه مستقل و ثابت به ازای هر تن.
        </p>
        <form noValidate onSubmit={createServiceContractDraft} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={labelStyle}>
            نرخ پایه (ریال/تن)
            <input value={scBaseRate} onChange={(e) => setScBaseRate(e.target.value)} style={inputStyle} placeholder="12000" />
          </label>
          <label style={labelStyle}>
            جامعه ثابت (ریال/تن)
            <input value={scCommunity} onChange={(e) => setScCommunity(e.target.value)} style={inputStyle} placeholder="500000" />
          </label>
          <label style={labelStyle}>
            کارت نرخ فعال (اختیاری)
            <select value={scRateCardId} onChange={(e) => setScRateCardId(e.target.value)} style={inputStyle}>
              <option value="">— بدون لینک —</option>
              {cards
                .filter((c) => c.status === "ACTIVE" && c.mine_id === Number(filterMine))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} {c.material_type} {c.rate.toLocaleString("fa-IR")}
                  </option>
                ))}
            </select>
          </label>
          <JalaliDatePicker label="اعتبار از" value={scValidFrom} onChange={setScValidFrom} />
          <button type="submit" disabled={busy === "sc-create"} style={btnStyle}>
            ایجاد پیش‌نویس قرارداد
          </button>
        </form>
        {draftContractId != null && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#374151" }}>پیش‌نویس #{draftContractId}</span>
            <button type="button" disabled={busy === "sc-sign-mine"} onClick={() => signContract("mine")} style={btnSmallStyle}>
              امضای معدن
            </button>
            <button type="button" disabled={busy === "sc-sign-coop"} onClick={() => signContract("coop")} style={btnSmallStyle}>
              امضای تعاونی
            </button>
            <button type="button" disabled={busy === "sc-activate"} onClick={activateServiceContract} style={btnSmallStyle}>
              فعال‌سازی قرارداد
            </button>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#0E3B13" }}>
              نسخه‌های قرارداد ({labelFa(OPERATION_TYPE_FA, "HAUL_TONNAGE")})
            </h3>
            {contractVersions.some((c) => contractDisplayStatus(c) === "ACTIVE") && !draftContractId && (
              <button
                type="button"
                style={btnSmallStyle}
                onClick={() => {
                  const cur = contractVersions.find((c) => contractDisplayStatus(c) === "ACTIVE");
                  if (cur) {
                    setNvBaseRate(String(cur.base_rate_rial));
                    setNvCommunity(String(cur.fixed_community_amount_rial_per_unit));
                    setNvRateCardId(cur.rate_card_id ? String(cur.rate_card_id) : "");
                  }
                  setShowNewVersionForm((v) => !v);
                }}
              >
                نسخه جدید (الحاقیه)
              </button>
            )}
          </div>

          {showNewVersionForm && (
            <form
              noValidate
              onSubmit={createNewContractVersion}
              style={{
                marginBottom: 12,
                padding: 12,
                border: "1px solid #D1FAE5",
                borderRadius: 8,
                background: "#fff",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "flex-end",
              }}
            >
              <label style={labelStyle}>
                شماره الحاقیه
                <input value={nvAmendmentRef} onChange={(e) => setNvAmendmentRef(e.target.value)} style={inputStyle} placeholder="AMEND-1405-03" />
              </label>
              <JalaliDatePicker label="اعتبار از" value={nvValidFrom} onChange={setNvValidFrom} />
              <label style={labelStyle}>
                نرخ پایه (ریال/تن)
                <input value={nvBaseRate} onChange={(e) => setNvBaseRate(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                جامعه ثابت (ریال/تن)
                <input value={nvCommunity} onChange={(e) => setNvCommunity(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                کارت نرخ (اختیاری)
                <select value={nvRateCardId} onChange={(e) => setNvRateCardId(e.target.value)} style={inputStyle}>
                  <option value="">— همان قبلی —</option>
                  {cards
                    .filter((c) => c.status === "ACTIVE" && c.mine_id === Number(filterMine))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.material_type} {c.rate.toLocaleString("fa-IR")}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" disabled={busy === "sc-new-version"} style={btnStyle}>
                ثبت نسخهٔ جدید
              </button>
            </form>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>نسخه</th>
                <th style={th}>الحاقیه</th>
                <th style={th}>نرخ پایه</th>
                <th style={th}>جامعه/تن</th>
                <th style={th}>کارت نرخ</th>
                <th style={th}>از</th>
                <th style={th}>تا</th>
                <th style={th}>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {contractVersions.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 12, color: "#6B7280" }}>
                    هنوز قراردادی برای این معدن/تعاونی ثبت نشده.
                  </td>
                </tr>
              )}
              {contractVersions.map((c) => {
                const badge = contractDisplayStatus(c);
                return (
                  <tr key={c.id}>
                    <td style={td}>v{c.contract_version}</td>
                    <td style={td}>{c.amendment_ref ?? "—"}</td>
                    <td style={td}>{c.base_rate_rial.toLocaleString("fa-IR")}</td>
                    <td style={td}>{c.fixed_community_amount_rial_per_unit.toLocaleString("fa-IR")}</td>
                    <td style={td}>{c.rate_card_id ? `#${c.rate_card_id}` : "—"}</td>
                    <td style={td}>{c.valid_from ? c.valid_from.slice(0, 10) : "—"}</td>
                    <td style={td}>{c.valid_to ? c.valid_to.slice(0, 10) : "—"}</td>
                    <td style={td}>
                      <span style={contractBadgeStyle(badge)}>{badge}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
        <thead>
          <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
            <th style={th}>شناسه</th>
            <th style={th}>معدن</th>
            <th style={th}>نوع</th>
            <th style={th}>ماده</th>
            <th style={th}>نرخ</th>
            <th style={th}>از</th>
            <th style={th}>تا</th>
            <th style={th}>وضعیت</th>
            <th style={th}>اقدام</th>
          </tr>
        </thead>
        <tbody>
          {cards.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: 12, color: "#6B7280" }}>
                برای این معدن/تاریخ نرخ فعال معتبری نیست.
              </td>
            </tr>
          )}
          {cards.map((c) => (
            <tr key={c.id}>
              <td style={td}>{c.id}</td>
              <td style={td}>{c.mine_id}</td>
              <td style={td}>{labelFa(OPERATION_TYPE_FA, c.operation_type)}</td>
              <td style={td}>{labelFa(MATERIAL_TYPE_FA, c.material_type)}</td>
              <td style={td}>{c.rate.toLocaleString("fa-IR")}</td>
              <td style={td}>{formatJalaliDate(c.effectiveFrom)}</td>
              <td style={td}>{c.effectiveTo ? formatJalaliDate(c.effectiveTo) : "—"}</td>
              <td style={td}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: c.status === "ACTIVE" ? "#ECFDF5" : c.status === "DRAFT" ? "#F3F1EB" : "#F3F4F6",
                    color: c.status === "ACTIVE" ? "#065F46" : c.status === "DRAFT" ? "#1E3A2F" : "#6B7280",
                  }}
                >
                  {labelFa(RATE_CARD_STATUS_FA, c.status)}
                </span>
              </td>
              <td style={td}>
                {c.status === "DRAFT" && (
                  <button
                    type="button"
                    disabled={busy === `act-${c.id}`}
                    onClick={() => activate(c.id)}
                    style={btnSmallStyle}
                  >
                    فعال‌سازی
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ padding: 14, border: "1px solid #E5E7EB", borderRadius: 10 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15, color: "#0E3B13" }}>افزودن نسخهٔ جدید (پیش‌نویس)</h2>
        <form noValidate onSubmit={createDraft} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={labelStyle}>
            معدن
            <select value={mineId} onChange={(e) => setMineId(e.target.value)} style={inputStyle}>
              <option value="1">معدن ۱</option>
              <option value="2">معدن ۲</option>
            </select>
          </label>
          <label style={labelStyle}>
            عملیات
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value as "TONNAGE" | "HOURLY")}
              style={inputStyle}
            >
              <option value="TONNAGE">تنی (TONNAGE)</option>
              <option value="HOURLY">ساعتی (HOURLY)</option>
            </select>
          </label>
          <label style={labelStyle}>
            ماده
            <input value={materialType} onChange={(e) => setMaterialType(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            واحد
            <select value={unitType} onChange={(e) => setUnitType(e.target.value as "TON" | "HOUR")} style={inputStyle}>
              <option value="TON">تن</option>
              <option value="HOUR">ساعت</option>
            </select>
          </label>
          <label style={labelStyle}>
            نرخ
            <input value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} placeholder="12000" />
          </label>
          <JalaliDatePicker label="اعتبار از" value={effectiveFrom} onChange={setEffectiveFrom} />
          <button type="submit" disabled={busy === "create"} style={btnStyle}>
            ایجاد پیش‌نویس
          </button>
        </form>
      </section>
    </PageFrame>
  );
}
