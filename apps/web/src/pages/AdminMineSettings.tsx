import React, { useCallback, useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { MineScope } from "../components/MineScope";
import { FormField } from "../components/FormField";
import { apiGetData, apiPatchData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { Alert, Button, FormRow, Select } from "../components/ui";
import { selectStyle } from "../theme";

type Cooperative = { id: number; name: string; mine_id: number };

type MineSettings = {
  mine_id: number;
  mine_code: string;
  name: string;
  platform_fee_value: number | null;
  geofence: { lat: number; lng: number; radius_m?: number } | null;
  dispatch_mode: "manual" | "auto";
  dispatch_mode_source: "mine" | "env";
  dispatch_mode_stored: "manual" | "auto" | null;
  community_rial_per_ton: number | null;
  service_contract_id: number | null;
  cooperative_id: number;
  operation_type_code: string;
};

export default function AdminMineSettings() {
  const [mineId, setMineId] = useState<number | null>(null);
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mineCode, setMineCode] = useState("");
  const [mineName, setMineName] = useState("");
  const [feePercent, setFeePercent] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("");
  const [dispatchStored, setDispatchStored] = useState<"" | "manual" | "auto" | "env">("env");
  const [communityRate, setCommunityRate] = useState("");
  const [coopId, setCoopId] = useState("1");

  const load = useCallback(async () => {
    if (mineId == null) return;
    const q = new URLSearchParams({ cooperative_id: coopId });
    const r = await apiGetData<{ settings: MineSettings; cooperatives: Cooperative[] }>(
      `/admin/mines/${mineId}/settings?${q}`,
    );
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setErr(null);
    const s = r.data.settings;
    setCooperatives(r.data.cooperatives ?? []);
    setMineCode(s.mine_code);
    setMineName(s.name);
    setFeePercent(s.platform_fee_value != null ? String(s.platform_fee_value * 100) : "");
    setLat(s.geofence?.lat != null ? String(s.geofence.lat) : "");
    setLng(s.geofence?.lng != null ? String(s.geofence.lng) : "");
    setRadius(s.geofence?.radius_m != null ? String(s.geofence.radius_m) : "500");
    setDispatchStored(s.dispatch_mode_stored ?? "env");
    setCommunityRate(s.community_rial_per_ton != null ? String(s.community_rial_per_ton) : "");
    setCoopId(String(s.cooperative_id));
  }, [mineId, coopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (mineId == null) {
      setErr("ابتدا معدن فعال را در بالا انتخاب کنید.");
      return;
    }
    const feeNum = feePercent.trim() === "" ? undefined : Number(feePercent) / 100;
    if (feeNum != null && (!Number.isFinite(feeNum) || feeNum <= 0 || feeNum > 1)) {
      setErr("کارمزد پلتفرم باید بین ۰ و ۱۰۰ درصد باشد.");
      return;
    }
    const latN = lat.trim() === "" ? undefined : Number(lat);
    const lngN = lng.trim() === "" ? undefined : Number(lng);
    const radiusN = radius.trim() === "" ? undefined : Number(radius);
    if ((latN != null || lngN != null) && (!Number.isFinite(latN!) || !Number.isFinite(lngN!))) {
      setErr("مختصات ژئوفنس نامعتبر است.");
      return;
    }
    const communityN = communityRate.trim() === "" ? undefined : Number(communityRate);
    if (communityN != null && (!Number.isFinite(communityN) || communityN <= 0)) {
      setErr("مبلغ مشارکت اجتماعی نامعتبر است.");
      return;
    }

    const body: Record<string, unknown> = {
      cooperative_id: Number(coopId),
      operation_type_code: "HAUL_TONNAGE",
    };
    if (feeNum != null) body.platform_fee_value = feeNum;
    if (latN != null && lngN != null) {
      body.geofence = { lat: latN, lng: lngN, ...(radiusN != null ? { radius_m: radiusN } : {}) };
    }
    if (dispatchStored === "env") body.dispatch_mode = null;
    else if (dispatchStored === "manual" || dispatchStored === "auto") body.dispatch_mode = dispatchStored;
    if (communityN != null) body.community_rial_per_ton = communityN;

    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await apiPatchData<{ settings: MineSettings }>(`/admin/mines/${mineId}/settings`, body);
    setBusy(false);
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setMsg("تنظیمات معدن ذخیره شد.");
    await load();
  }

  return (
    <PageFrame
      title="تنظیمات معدن"
      intro="کارمزد پلتفرم، ژئوفنس، حالت dispatch و مشارکت اجتماعی — از پایگاه داده؛ بدون deploy."
      expectedRoles={["ADMIN"]}
    >
      <MineScope onMineSelected={setMineId} />

      {err && <Alert variant="danger">{err}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      {mineId == null ? (
        <Alert variant="warn">برای ویرایش تنظیمات، معدن فعال را انتخاب و «ثبت معدن فعال» را بزنید.</Alert>
      ) : (
        <FormRow
          as="form"
          noValidate
          onSubmit={save}
          actions={
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "ذخیره تنظیمات"}
            </Button>
          }
        >
          <FormField label="کد معدن">
            <input value={mineCode} disabled style={selectStyle} />
          </FormField>
          <FormField label="نام معدن">
            <input value={mineName} disabled style={selectStyle} />
          </FormField>
          <FormField label="کارمزد پلتفرم (٪ از کرایه عملیاتی)">
            <input
              value={feePercent}
              onChange={(e) => setFeePercent(e.target.value)}
              placeholder="مثلاً 1 برای یک درصد"
              style={selectStyle}
            />
          </FormField>
          <FormField label="تعاونی (قرارداد فعال)">
            <Select value={coopId} onChange={(e) => setCoopId(e.target.value)} style={selectStyle}>
              {(cooperatives.length ? cooperatives : [{ id: 1, name: "تعاونی ۱", mine_id: mineId }]).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} (#{c.id})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="مشارکت اجتماعی (ریال به ازای هر تن)">
            <input
              value={communityRate}
              onChange={(e) => setCommunityRate(e.target.value)}
              style={selectStyle}
            />
          </FormField>
          <FormField label="عرض جغرافیایی مرکز">
            <input value={lat} onChange={(e) => setLat(e.target.value)} style={selectStyle} />
          </FormField>
          <FormField label="طول جغرافیایی مرکز">
            <input value={lng} onChange={(e) => setLng(e.target.value)} style={selectStyle} />
          </FormField>
          <FormField label="شعاع ژئوفنس (متر)">
            <input value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle} />
          </FormField>
          <FormField label="حالت dispatch">
            <Select
              value={dispatchStored}
              onChange={(e) => setDispatchStored(e.target.value as typeof dispatchStored)}
              style={selectStyle}
            >
              <option value="env">پیش‌فرض سرور (متغیر محیط)</option>
              <option value="manual">دستی (فقط از بورد تخصیص)</option>
              <option value="auto">خودکار (بلافاصله پس از ثبت نیاز)</option>
            </Select>
          </FormField>
        </FormRow>
      )}
    </PageFrame>
  );
}
