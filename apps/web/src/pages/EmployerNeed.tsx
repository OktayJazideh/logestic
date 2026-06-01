import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { MineScope } from "../components/MineScope";
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
  const { getError, validateAll, validateField } = useFieldValidation();

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

  return (
    <PageFrame
      title="ثبت نیاز عملیاتی — کارفرما"
      expectedRoles={["EMPLOYER", "ADMIN"]}
      intro={
        <>
          نقش EMPLOYER: تعیین معدن فعال، انتخاب روستای مقصد و ثبت نیاز حمل تنی یا عملیات ساعتی.{" "}
          <Link to="/panel/employer/inbox" style={{ color: "#1B5E20", fontWeight: 600 }}>
            مشاهده دفترچه نیازها
          </Link>
        </>
      }
    >
      <MineScope onMineSelected={() => loadVillages()} />

      {vilErr && <div style={{ color: "#B45309", marginBottom: 12, fontSize: 14 }}>{vilErr}</div>}
      {submitErr && (
        <div style={{ color: "#B91C1C", marginBottom: 12, fontSize: 14, padding: 12, background: "#FEF2F2", borderRadius: 8 }}>
          {submitErr}
        </div>
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
          maxWidth: 480,
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          background: "#FAFAFA",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
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

        <form style={{ padding: 16 }} noValidate onSubmit={handleSubmit}>
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

          {tab === "haul" ? (
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
          ) : (
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
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>یادداشت</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", resize: "vertical" as const }}
            />
          </div>
          <button
            data-testid="employer-submit"
            type="submit"
            disabled={busy}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: busy ? "#9CA3AF" : "#1B5E20",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "در حال ثبت…" : tab === "haul" ? "ثبت نیاز حمل" : "ثبت نیاز ساعتی"}
          </button>
        </form>
      </div>
    </PageFrame>
  );
}
