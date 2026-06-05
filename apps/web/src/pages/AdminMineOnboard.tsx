import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { FormField } from "../components/FormField";
import { apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { Alert, Button, FormRow } from "../components/ui";
import { selectStyle, brand } from "../theme";

type OnboardResult = {
  mine_id: number;
  mine_code: string;
  name: string;
  cooperative_id: number;
  rate_card_id: number;
  service_contract_id: number;
  village_id: number | null;
};

export default function AdminMineOnboard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [feePercent, setFeePercent] = useState("1");
  const [communityRate, setCommunityRate] = useState("400000");
  const [coopName, setCoopName] = useState("");
  const [lat, setLat] = useState("27.0");
  const [lng, setLng] = useState("55.0");
  const [radius, setRadius] = useState("500");
  const [villageName, setVillageName] = useState("روستای پیش‌فرض");

  function validateStep1(): boolean {
    if (name.trim().length < 2) {
      setErr("نام معدن حداقل ۲ کاراکتر باشد.");
      return false;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(slug.trim()) || slug.trim().length < 2) {
      setErr("کد معدن باید انگلیسی/عدد باشد (خط تیره مجاز).");
      return false;
    }
    setErr(null);
    return true;
  }

  function validateStep2(): boolean {
    const feeNum = Number(feePercent) / 100;
    const communityN = Number(communityRate);
    if (!Number.isFinite(feeNum) || feeNum <= 0 || feeNum > 1) {
      setErr("کارمزد پلتفرم باید بین ۰ و ۱۰۰ درصد باشد.");
      return false;
    }
    if (!Number.isFinite(communityN) || communityN <= 0) {
      setErr("مبلغ مشارکت اجتماعی نامعتبر است.");
      return false;
    }
    setErr(null);
    return true;
  }

  function validateStep3(): boolean {
    const latN = Number(lat);
    const lngN = Number(lng);
    const radiusN = Number(radius);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      setErr("مختصات ژئوفنس نامعتبر است.");
      return false;
    }
    if (!Number.isFinite(radiusN) || radiusN <= 0) {
      setErr("شعاع ژئوفنس باید عدد مثبت باشد.");
      return false;
    }
    setErr(null);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep3()) return;

    const feeNum = Number(feePercent) / 100;
    const communityN = Number(communityRate);
    const latN = Number(lat);
    const lngN = Number(lng);
    const radiusN = Number(radius);

    const body: Record<string, unknown> = {
      name: name.trim(),
      slug: slug.trim(),
      platform_fee: feeNum,
      community_rial_per_ton: communityN,
      geofence: { lat: latN, lng: lngN, radius_m: radiusN },
    };
    if (coopName.trim()) body.cooperative_name = coopName.trim();
    if (villageName.trim()) body.village_name = villageName.trim();

    setBusy(true);
    setErr(null);
    const r = await apiPostData<{ onboard: OnboardResult }>("/admin/mines/onboard", body);
    setBusy(false);
    if (!r.ok) {
      setErr(apiErrorMessageFa(r.code, r.message));
      return;
    }
    navigate("/workspace-select", { replace: true });
  }

  return (
    <PageFrame
      title="ثبت معدن جدید"
      intro="ایجاد معدن، تعاونی، کارت نرخ و قرارداد نسخه ۱ — بدون ویرایش seed."
      expectedRoles={["ADMIN"]}
    >
      <div className="simple-wizard-steps" data-testid="mine-onboard-wizard-step" style={{ marginBottom: 16 }}>
        <span className={step === 1 ? "simple-wizard-steps__item--active" : ""}>مرحله ۱ — شناسه</span>
        <span>·</span>
        <span className={step === 2 ? "simple-wizard-steps__item--active" : ""}>مالی</span>
        <span>·</span>
        <span className={step === 3 ? "simple-wizard-steps__item--active" : ""}>ژئوفنس و ثبت</span>
      </div>

      {err && <Alert variant="danger">{err}</Alert>}

      {step === 1 && (
        <FormRow
          as="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validateStep1()) setStep(2);
          }}
          actions={
            <Button type="submit">ادامه</Button>
          }
        >
          <FormField label="نام معدن">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً معدن طلای تفتان"
              style={selectStyle}
              data-testid="onboard-name"
            />
          </FormField>
          <FormField label="کد معدن (slug)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toUpperCase())}
              placeholder="مثلاً TAFTAN یا MINE-C"
              style={selectStyle}
              data-testid="onboard-slug"
            />
          </FormField>
        </FormRow>
      )}

      {step === 2 && (
        <FormRow
          as="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validateStep2()) setStep(3);
          }}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                مرحله قبل
              </Button>
              <Button type="submit">ادامه</Button>
            </>
          }
        >
          <FormField label="کارمزد پلتفرم (٪ از کرایه عملیاتی)">
            <input
              value={feePercent}
              onChange={(e) => setFeePercent(e.target.value)}
              placeholder="مثلاً 1"
              style={selectStyle}
              data-testid="onboard-fee"
            />
          </FormField>
          <FormField label="مشارکت اجتماعی (ریال به ازای هر تن)">
            <input
              value={communityRate}
              onChange={(e) => setCommunityRate(e.target.value)}
              style={selectStyle}
              data-testid="onboard-community"
            />
          </FormField>
          <FormField label="نام تعاونی (اختیاری)">
            <input
              value={coopName}
              onChange={(e) => setCoopName(e.target.value)}
              placeholder="پیش‌فرض: تعاونی + نام معدن"
              style={selectStyle}
            />
          </FormField>
        </FormRow>
      )}

      {step === 3 && (
        <FormRow
          as="form"
          noValidate
          onSubmit={submit}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={busy}>
                مرحله قبل
              </Button>
              <Button type="submit" disabled={busy} data-testid="onboard-submit">
                {busy ? "…" : "ثبت معدن"}
              </Button>
            </>
          }
        >
          <div
            style={{
              padding: 12,
              marginBottom: 12,
              borderRadius: 8,
              background: "#F9FAFB",
              border: `1px solid ${brand.border}`,
              fontSize: 14,
            }}
          >
            <strong>مرور:</strong> {name} ({slug}) — کارمزد {feePercent}٪ — مشارکت {communityRate} ریال/تن
          </div>
          <FormField label="عرض جغرافیایی مرکز">
            <input value={lat} onChange={(e) => setLat(e.target.value)} style={selectStyle} data-testid="onboard-lat" />
          </FormField>
          <FormField label="طول جغرافیایی مرکز">
            <input value={lng} onChange={(e) => setLng(e.target.value)} style={selectStyle} data-testid="onboard-lng" />
          </FormField>
          <FormField label="شعاع ژئوفنس (متر)">
            <input value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle} data-testid="onboard-radius" />
          </FormField>
          <FormField label="نام روستای پیش‌فرض">
            <input value={villageName} onChange={(e) => setVillageName(e.target.value)} style={selectStyle} />
          </FormField>
        </FormRow>
      )}
    </PageFrame>
  );
}
