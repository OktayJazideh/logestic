import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField, fieldBorderStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostPublic, getRememberMePreference, getStoredToken, setRememberMePreference, setStoredToken } from "../api";
import { mobileNumber, otpCode, required, runValidators } from "../lib/validation";
import { BrandLogo } from "../components/BrandLogo";
import { DemoLoginPanel } from "../components/DemoLoginPanel";
import { loginErrorMessage } from "../lib/authMessages";
import { brandNames } from "../brand";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { Button, Input } from "../components/ui";
import { simpleLabel } from "../lib/uiLabels";
import { brand, cardStyle, inputStyle, radius, shadow, space } from "../theme";

const MOBILE_DOWNLOADS = [
  {
    href: "/downloads/logestic-driver.apk",
    label: "اپ راننده",
    hint: "مأموریت و باسکول",
  },
  {
    href: "/downloads/logestic-community.apk",
    label: "اپ تعاونی",
    hint: "اعضا و عملیات",
  },
] as const;

const RESEND_COOLDOWN_SEC = 60;

type VerifyDetails = { reason?: string; attemptsLeft?: number };

function otpErrorMessage(details: VerifyDetails | undefined, fallback: string): string {
  const reason = details?.reason;
  if (reason === "locked") return "۳ بار اشتباه زدید. «ارسال دوباره» بزنید.";
  if (reason === "expired") return "کد منقضی شده. «ارسال دوباره» بزنید.";
  if (reason === "not_found") return "ابتدا «دریافت کد ورود» را بزنید.";
  if (reason === "invalid") {
    const left = details?.attemptsLeft;
    if (typeof left === "number" && left > 0) return `کد نادرست (${left} تلاش مانده).`;
    return "کد نادرست است.";
  }
  return fallback;
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: brand.bg,
  fontFamily: brand.fontFamily,
  boxSizing: "border-box",
};

const loginCardStyle: React.CSSProperties = {
  ...cardStyle,
  width: "100%",
  maxWidth: 420,
  padding: space.xl,
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  boxSizing: "border-box",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSec, setResendSec] = useState(0);
  const [checkingSession, setCheckingSession] = useState(true);
  const [rememberMe, setRememberMe] = useState(getRememberMePreference);
  const { getError, validateField, validateAll, clearErrors } = useFieldValidation();

  const mobileValidators = useMemo(() => [required("شماره موبایل"), mobileNumber()], []);
  const otpValidators = useMemo(() => [required("کد تأیید"), otpCode()], []);

  const mobileValid = !runValidators(mobile, mobileValidators);
  const otpValid = !runValidators(otp, otpValidators);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    apiGetData<{ id: number; mine_id: number | null }>("/auth/me").then((r) => {
      if (cancelled) return;
      if (r.ok) {
        if (r.data.mine_id == null) {
          navigate("/workspace-select", { replace: true });
        } else {
          navigate("/panel", { replace: true });
        }
        return;
      }
      if (r.status === 401) setStoredToken("");
      setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = window.setInterval(() => {
      setResendSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendSec]);

  const startResendCooldown = useCallback(() => {
    setResendSec(RESEND_COOLDOWN_SEC);
  }, []);

  const requestOtp = useCallback(async () => {
    const m = mobile.trim();
    if (!validateAll({ mobile: { value: m, validators: mobileValidators } })) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiPostPublic<{ expires_in_seconds: number }>("/auth/request-otp", {
      mobile_number: m,
    });
    setBusy(false);
    if (r.ok) {
      setMobile(m);
      setStep(2);
      setOtp("");
      clearErrors();
      startResendCooldown();
      return;
    }
    if (r.status === 429) {
      setError("درخواست زیاد. یک دقیقه صبر کنید.");
      return;
    }
    setError(loginErrorMessage(r.code, r.message));
  }, [mobile, startResendCooldown, validateAll, mobileValidators, clearErrors]);

  const verifyOtp = useCallback(async () => {
    const m = mobile.trim();
    const code = otp.trim();
    if (!validateAll({ otp: { value: code, validators: otpValidators } })) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiPostPublic<{ access_token: string; role: string }>("/auth/verify-otp", {
      mobile_number: m,
      otp_code: code,
    });
    setBusy(false);
    if (r.ok) {
      setStoredToken(r.data.access_token, rememberMe);
      navigate("/workspace-select", { replace: true });
      return;
    }
    const details = r.details as VerifyDetails | undefined;
    setError(otpErrorMessage(details, loginErrorMessage(r.code, r.message)));
  }, [mobile, otp, navigate, validateAll, otpValidators, rememberMe]);

  if (checkingSession) {
    return (
      <LoginShell>
        <LoginCard>
          <p style={{ margin: 0, color: brand.textMuted, fontSize: 14 }}>بررسی ورود…</p>
        </LoginCard>
      </LoginShell>
    );
  }

  const mobileError = getError("mobile");
  const otpError = getError("otp");

  return (
    <LoginShell>
      <LoginCard>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <BrandLogo variant="full" size={44} />
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, color: brand.primaryDark, fontWeight: 700, textAlign: "center" }}>
          ورود به {brandNames.panel.short}
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: brand.textSoft, textAlign: "center" }}>
          {brandNames.tagline}
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 15, color: brand.textMuted, lineHeight: 1.55, textAlign: "center" }}>
          {step === 1 ? "شماره موبایل ثبت‌شده را وارد کنید." : "کد ۶ رقمی پیامک‌شده را وارد کنید."}
        </p>
        {step === 2 && (
          <p
            style={{
              margin: "-12px 0 16px",
              fontSize: 13,
              color: brand.textSoft,
              textAlign: "center",
              direction: "ltr",
              letterSpacing: 0.5,
            }}
          >
            {mobile}
          </p>
        )}

        {error && (
          <ErrorBanner
            message={error}
            actionHint={step === 2 ? "«ارسال دوباره» یا «تغییر شماره»." : "شماره ثبت‌شده را وارد کنید."}
            onRetry={
              step === 2
                ? () => void requestOtp()
                : () => {
                    setError(null);
                  }
            }
          />
        )}

        {step === 1 ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void requestOtp();
            }}
          >
            <FormField
              label="شماره موبایل"
              required
              error={mobileError}
              hint="مثال: ۰۹۱۲۱۲۳۴۵۶۷"
              htmlFor="login-mobile"
            >
              <Input
                id="login-mobile"
                data-testid="login-mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="09121234567"
                value={mobile}
                hasError={!!mobileError}
                onChange={(e) => {
                  setMobile(e.target.value.replace(/\D/g, "").slice(0, 15));
                  if (mobileError) validateField("mobile", e.target.value.replace(/\D/g, "").slice(0, 15), mobileValidators);
                }}
                onBlur={() => validateField("mobile", mobile, mobileValidators)}
                disabled={busy}
                aria-invalid={!!mobileError}
                style={fieldBorderStyle(inputStyle, mobileError)}
              />
            </FormField>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
                fontSize: 13,
                color: brand.textMuted,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                data-testid="login-remember-me"
                checked={rememberMe}
                onChange={(e) => {
                  setRememberMe(e.target.checked);
                  setRememberMePreference(e.target.checked);
                }}
                disabled={busy}
              />
              مرا به خاطر بسپار
            </label>
            <Button
              data-testid="login-request-otp"
              type="submit"
              fullWidth
              disabled={busy || !mobileValid}
            >
              {busy ? "در حال ارسال…" : "دریافت کد ورود"}
            </Button>
            <DemoLoginPanel app="web" />
            <MobileDownloadLinks />
          </form>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void verifyOtp();
            }}
          >
            <FormField label={simpleLabel("otp")} required error={otpError} htmlFor="login-otp">
              <Input
                id="login-otp"
                data-testid="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="------"
                value={otp}
                hasError={!!otpError}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtp(v);
                  if (otpError) validateField("otp", v, otpValidators);
                }}
                onBlur={() => validateField("otp", otp, otpValidators)}
                disabled={busy}
                aria-invalid={!!otpError}
                className="login-otp-input"
                style={fieldBorderStyle({ ...inputStyle, letterSpacing: 8, textAlign: "center", fontSize: 24, minHeight: 56 }, otpError)}
              />
            </FormField>
            <Button data-testid="login-verify" type="submit" fullWidth disabled={busy || !otpValid}>
              {busy ? "در حال ورود…" : "ورود"}
            </Button>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                type="button"
                disabled={busy || resendSec > 0 || !mobileValid}
                onClick={() => void requestOtp()}
              >
                {resendSec > 0 ? `ارسال دوباره (${resendSec})` : "ارسال دوباره"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError(null);
                  setResendSec(0);
                  clearErrors();
                }}
              >
                تغییر شماره
              </Button>
            </div>
          </form>
        )}
        {import.meta.env.VITE_BUILD_SHA ? (
          <p style={{ margin: "16px 0 0", fontSize: 10, color: brand.textSoft, textAlign: "center" }}>
            {import.meta.env.VITE_BUILD_SHA}
          </p>
        ) : null}
      </LoginCard>
    </LoginShell>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={pageStyle} dir="rtl">
      {children}
    </div>
  );
}

function LoginCard({ children }: { children: React.ReactNode }) {
  return <div style={loginCardStyle}>{children}</div>;
}

function MobileDownloadLinks() {
  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: `1px solid ${brand.border}`,
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: brand.primaryDark, textAlign: "center" }}>
        دانلود اپ
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MOBILE_DOWNLOADS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            download
            style={{
              display: "block",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${brand.border}`,
              background: brand.panelMuted,
              textDecoration: "none",
              color: brand.text,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: brand.textMuted, marginTop: 2 }}>{item.hint}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
