import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SimplePageLayout } from "../components/simple/SimplePageLayout";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { MineScope } from "../components/MineScope";
import { breadcrumbsForPath } from "../lib/panelBreadcrumbs";
import { brand } from "../theme";
import { fieldBorderStyle, fieldErrorStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostData, getStoredToken } from "../api";
import { minLength, optionalPositiveNumber, positiveNumber, required } from "../lib/validation";

type VillageRow = { id: number; mine_id: number; name: string; district?: string };
type OperationTypeRow = { id: string; code: string; name_fa: string };
type NeedTab = "haul" | "hourly";

export default function EmployerNeed() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<NeedTab>("haul");
  const [villages, setVillages] = useState<VillageRow[]>([]);
  const [haulTypeId, setHaulTypeId] = useState("");
  const [hourlyTypeId, setHourlyTypeId] = useState("");
  const [villageId, setVillageId] = useState<number | "">("");
  const [materialType, setMaterialType] = useState("ORE");
  const [tons, setTons] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [locationText, setLocationText] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [note, setNote] = useState("");
  const [vilErr, setVilErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const { getError, validateAll, validateField } = useFieldValidation();

  function validateStep1(): boolean {
    return validateAll({
      villageId: { value: villageId === "" ? "" : String(villageId), validators: [required("روستای مقصد")] },
    });
  }

  function validateStep2(): boolean {
    if (tab === "haul") {
      return validateAll({
        materialType: { value: materialType, validators: [required("نوع ماده"), minLength(1, "نوع ماده")] },
        tons: { value: tons, validators: [required("حجم تن"), positiveNumber("حجم تن")] },
      });
    }
    return validateAll({
      equipmentType: { value: equipmentType, validators: [required("نوع تجهیز"), minLength(2, "نوع تجهیز")] },
      locationText: { value: locationText, validators: [required("محل عملیات"), minLength(3, "محل عملیات")] },
      estimatedHours: { value: estimatedHours, validators: [optionalPositiveNumber("ساعات تخمینی")] },
    });
  }

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
  };

  function loadVillages() {
    if (!getStoredToken()) return;
    apiGetData<{ villages: VillageRow[] }>("/villages").then((r) => {
      if (r.ok) {
        setVillages(r.data.villages);
        setVilErr(null);
      } else {
        setVillages([]);
        setVilErr(r.message);
      }
    });
    apiGetData<{ items: OperationTypeRow[] }>("/operation-types").then((r) => {
      if (r.ok && r.data.items.length > 0) {
        const haul = r.data.items.find((t) => t.code === "HAUL_TONNAGE");
        const hourly = r.data.items.find((t) => t.code === "HOURLY_EQUIPMENT");
        setHaulTypeId(haul?.id ?? "");
        setHourlyTypeId(hourly?.id ?? "");
      }
    });
  }

  useEffect(() => {
    loadVillages();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    setSubmitOk(null);

    if (tab === "haul") {
      const ok = validateAll({
        villageId: { value: villageId === "" ? "" : String(villageId), validators: [required("روستای مقصد")] },
        materialType: { value: materialType, validators: [required("نوع ماده"), minLength(1, "نوع ماده")] },
        tons: { value: tons, validators: [required("حجم تن"), positiveNumber("حجم تن")] },
      });
      if (!ok) return;
    } else {
      const schema = {
        villageId: { value: villageId === "" ? "" : String(villageId), validators: [required("روستای مقصد")] },
        equipmentType: { value: equipmentType, validators: [required("نوع تجهیز"), minLength(2, "نوع تجهیز")] },
        locationText: { value: locationText, validators: [required("محل عملیات"), minLength(3, "محل عملیات")] },
        estimatedHours: { value: estimatedHours, validators: [optionalPositiveNumber("ساعات تخمینی")] },
      };
      if (!validateAll(schema)) return;
    }

    if (!villageId) return;

    setBusy(true);
    if (tab === "haul") {
      const qty = Number(tons.replace(/,/g, "."));

      const r = await apiPostData<{ need: { id: number } }>("/employer/needs", {
        village_id: villageId,
        material_type: materialType.trim(),
        quantity_tons: qty,
        operation_type_id: haulTypeId || undefined,
        note: note.trim() || undefined,
      });
      setBusy(false);

      if (!r.ok) {
        setSubmitErr(r.message);
        return;
      }

      setSubmitOk(`نیاز حمل #${r.data.need.id} با موفقیت ثبت شد.`);
      setTons("");
      setNote("");
      setVillageId("");
      return;
    }

    const hoursRaw = estimatedHours.trim();
    let estimated_hours: number | undefined;
    if (hoursRaw) {
      estimated_hours = Number(hoursRaw.replace(/,/g, "."));
    }

    const r = await apiPostData<{ need: { id: number } }>("/employer/needs", {
      village_id: villageId,
      operation_type_id: hourlyTypeId || undefined,
      operation_type: "HOURLY",
      equipment_type: equipmentType.trim(),
      location_text: locationText.trim(),
      estimated_hours,
      note: note.trim() || undefined,
    });
    setBusy(false);

    if (!r.ok) {
      setSubmitErr(r.message);
      return;
    }

    setSubmitOk(`نیاز عملیات ساعتی #${r.data.need.id} با موفقیت ثبت شد.`);
    setEquipmentType("");
    setLocationText("");
    setEstimatedHours("");
    setNote("");
    setVillageId("");
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 12px",
    border: "none",
    borderBottom: active ? "2px solid #1B5E20" : "2px solid transparent",
    background: active ? "#F0FDF4" : "transparent",
    color: active ? "#1B5E20" : "#6B7280",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    fontSize: 14,
  });

  const villageName = villages.find((v) => v.id === villageId)?.name ?? "—";

  return (
    <SimplePageLayout
      title="ثبت نیاز کارفرما"
      subtitle="نیاز حمل یا کار ساعتی را در سه مرحله ثبت کنید."
      breadcrumb={breadcrumbsForPath("/panel/employer")}
      expectedRoles={["EMPLOYER", "ADMIN"]}
      footer={
        wizardStep < 3
          ? [
              ...(wizardStep > 1
                ? [
                    {
                      label: "مرحله قبل",
                      variant: "secondary" as const,
                      onClick: () => setWizardStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s)),
                    },
                  ]
                : []),
              {
                label: wizardStep === 1 ? "ادامه" : "مرور و تأیید",
                variant: "primary" as const,
                onClick: () => {
                  if (wizardStep === 1 && validateStep1()) setWizardStep(2);
                  else if (wizardStep === 2 && validateStep2()) setWizardStep(3);
                },
              },
            ]
          : [
              {
                label: "مرحله قبل",
                variant: "secondary" as const,
                onClick: () => setWizardStep(2),
              },
              {
                label: busy ? "در حال ثبت…" : tab === "haul" ? "ثبت نیاز حمل" : "ثبت نیاز ساعتی",
                variant: "primary" as const,
                busy,
                disabled: busy,
                testId: "employer-submit",
                type: "submit",
                onClick: () => {
                  const form = document.getElementById("employer-wizard-form") as HTMLFormElement | null;
                  form?.requestSubmit();
                },
              },
            ]
      }
    >
      <div className="simple-wizard-steps" data-testid="employer-wizard-step">
        <span className={wizardStep === 1 ? "simple-wizard-steps__item--active" : ""}>مرحله ۱ از ۳ — نوع و مقصد</span>
        <span>·</span>
        <span className={wizardStep === 2 ? "simple-wizard-steps__item--active" : ""}>جزئیات</span>
        <span>·</span>
        <span className={wizardStep === 3 ? "simple-wizard-steps__item--active" : ""}>ثبت</span>
      </div>

      <p style={{ margin: "0 0 12px", fontSize: 14 }}>
        <Link to="/panel/employer/inbox" style={{ color: brand.primary, fontWeight: 600 }}>
          پیگیری نیازهای قبلی
        </Link>
      </p>

      <MineScope onMineSelected={() => loadVillages()} />

      {vilErr && <ErrorBanner message={vilErr} actionHint="معدن فعال را در بالا انتخاب کنید." onRetry={() => loadVillages()} />}
      {submitErr && (
        <ErrorBanner message={submitErr} actionHint="اطلاعات را اصلاح کنید و دوباره ثبت کنید." onRetry={() => setSubmitErr(null)} />
      )}
      {submitOk && (
        <div style={{ color: "#166534", marginBottom: 12, fontSize: 14, padding: 12, background: "#F0FDF4", borderRadius: 8 }}>
          {submitOk}{" "}
          <button
            type="button"
            onClick={() => navigate("/panel/employer/inbox")}
            style={{
              marginRight: 8,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #86EFAC",
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            رفتن به دفترچه
          </button>
        </div>
      )}

      <div
        style={{
          maxWidth: 520,
          border: `1px solid ${brand.border}`,
          borderRadius: 12,
          background: brand.panel,
          overflow: "hidden",
        }}
      >
        <form id="employer-wizard-form" style={{ padding: 16 }} noValidate onSubmit={handleSubmit}>
          {wizardStep === 1 && (
            <>
              <div style={{ display: "flex", borderBottom: `1px solid ${brand.border}`, marginBottom: 16 }}>
                <button
                  type="button"
                  data-testid="employer-tab-haul"
                  style={tabStyle(tab === "haul")}
                  onClick={() => setTab("haul")}
                >
                  حمل تنی
                </button>
                <button
                  type="button"
                  data-testid="employer-tab-hourly"
                  style={tabStyle(tab === "hourly")}
                  onClick={() => setTab("hourly")}
                >
                  عملیات ساعتی
                </button>
              </div>
              <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              روستای مقصد <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <select
              data-testid="employer-village"
              value={villageId === "" ? "" : String(villageId)}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : "";
                setVillageId(v);
                validateField("villageId", v === "" ? "" : String(v), [required("روستای مقصد")]);
              }}
              onBlur={() =>
                validateField("villageId", villageId === "" ? "" : String(villageId), [required("روستای مقصد")])
              }
              style={fieldBorderStyle(inputBase, getError("villageId"))}
            >
              <option value="">— ابتدا معدن را انتخاب کنید —</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.district ? ` — ${v.district}` : ""}
                </option>
              ))}
            </select>
            {getError("villageId") && <div role="alert" style={fieldErrorStyle}>{getError("villageId")}</div>}
              </div>
            </>
          )}

          {wizardStep === 2 && tab === "haul" ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  نوع ماده <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  data-testid="employer-material"
                  type="text"
                  value={materialType}
                  onChange={(e) => {
                    setMaterialType(e.target.value);
                    validateField("materialType", e.target.value, [required("نوع ماده")]);
                  }}
                  onBlur={() => validateField("materialType", materialType, [required("نوع ماده")])}
                  placeholder="مثال: ORE"
                  style={fieldBorderStyle(inputBase, getError("materialType"))}
                />
                {getError("materialType") && <div role="alert" style={fieldErrorStyle}>{getError("materialType")}</div>}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  حجم تخمینی (تن) <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  data-testid="employer-tons"
                  type="text"
                  inputMode="decimal"
                  value={tons}
                  onChange={(e) => {
                    setTons(e.target.value);
                    validateField("tons", e.target.value, [required("حجم تن"), positiveNumber("حجم تن")]);
                  }}
                  onBlur={() => validateField("tons", tons, [required("حجم تن"), positiveNumber("حجم تن")])}
                  placeholder="مثال: 24"
                  style={fieldBorderStyle(inputBase, getError("tons"))}
                />
                {getError("tons") && <div role="alert" style={fieldErrorStyle}>{getError("tons")}</div>}
              </div>
            </>
          ) : wizardStep === 2 ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  نوع تجهیز <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  data-testid="employer-equipment"
                  type="text"
                  value={equipmentType}
                  onChange={(e) => {
                    setEquipmentType(e.target.value);
                    validateField("equipmentType", e.target.value, [required("نوع تجهیز"), minLength(2, "نوع تجهیز")]);
                  }}
                  onBlur={() =>
                    validateField("equipmentType", equipmentType, [required("نوع تجهیز"), minLength(2, "نوع تجهیز")])
                  }
                  placeholder="مثال: بیل مکانیکی"
                  style={fieldBorderStyle(inputBase, getError("equipmentType"))}
                />
                {getError("equipmentType") && <div role="alert" style={fieldErrorStyle}>{getError("equipmentType")}</div>}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  محل عملیات <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  data-testid="employer-location"
                  type="text"
                  value={locationText}
                  onChange={(e) => {
                    setLocationText(e.target.value);
                    validateField("locationText", e.target.value, [required("محل عملیات"), minLength(3, "محل عملیات")]);
                  }}
                  onBlur={() =>
                    validateField("locationText", locationText, [required("محل عملیات"), minLength(3, "محل عملیات")])
                  }
                  placeholder="مثال: سایت A — شمال معدن"
                  style={fieldBorderStyle(inputBase, getError("locationText"))}
                />
                {getError("locationText") && <div role="alert" style={fieldErrorStyle}>{getError("locationText")}</div>}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  ساعات تخمینی (اختیاری)
                </label>
                <input
                  data-testid="employer-estimated-hours"
                  type="text"
                  inputMode="decimal"
                  value={estimatedHours}
                  onChange={(e) => {
                    setEstimatedHours(e.target.value);
                    if (e.target.value.trim()) {
                      validateField("estimatedHours", e.target.value, [optionalPositiveNumber("ساعات تخمینی")]);
                    }
                  }}
                  onBlur={() => {
                    if (estimatedHours.trim()) {
                      validateField("estimatedHours", estimatedHours, [optionalPositiveNumber("ساعات تخمینی")]);
                    }
                  }}
                  placeholder="مثال: 8"
                  style={fieldBorderStyle(inputBase, getError("estimatedHours"))}
                />
                {getError("estimatedHours") && <div role="alert" style={fieldErrorStyle}>{getError("estimatedHours")}</div>}
              </div>
            </>
          ) : null}

          {wizardStep === 2 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>یادداشت</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", resize: "vertical" as const }}
              />
            </div>
          )}

          {wizardStep === 3 && (
            <div style={{ fontSize: 15, lineHeight: 1.8, color: brand.text }}>
              <p style={{ margin: "0 0 12px", fontWeight: 700, color: brand.primaryDark }}>خلاصه قبل از ثبت</p>
              <div>نوع: {tab === "haul" ? "حمل تنی" : "عملیات ساعتی"}</div>
              <div>روستا: {villageName}</div>
              {tab === "haul" ? (
                <>
                  <div>ماده: {materialType}</div>
                  <div>حجم: {tons} تن</div>
                </>
              ) : (
                <>
                  <div>تجهیز: {equipmentType}</div>
                  <div>محل: {locationText}</div>
                  {estimatedHours && <div>ساعات: {estimatedHours}</div>}
                </>
              )}
              {note && <div>یادداشت: {note}</div>}
            </div>
          )}
        </form>
      </div>
    </SimplePageLayout>
  );
}
