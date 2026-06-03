import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField, fieldBorderStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostPublic, getStoredToken, setStoredToken } from "../api";
import { mobileNumber, otpCode, required, runValidators } from "../lib/validation";
import { BrandLogo } from "../components/BrandLogo";
import { DemoLoginPanel } from "../components/DemoLoginPanel";
import { loginErrorMessage } from "../lib/authMessages";
import { brand, btnPrimary, btnSecondary } from "../theme";

const RESEND_COOLDOWN_SEC = 60;

type VerifyDetails = { reason?: string; attemptsLeft?: number };

function otpErrorMessage(details: VerifyDetails | undefined, fallback: string): string {
  const reason = details?.reason;
  if (reason === "locked") {
    return "پس از ۳ تلاش اشتباه ورود قفل شد. OTP جدید درخواست کنید.";
  }
  if (reason === "expired") {
    return "کد منقضی شده است. OTP جدید درخواست کنید.";
  }
  if (reason === "not_found") {
    return "ابتدا درخواست OTP دهید.";
  }
  if (reason === "invalid") {
    const left = details?.attemptsLeft;
    if (typeof left === "number") {
      return left > 0 ? `کد اشتباه است. ${left} تلاش باقی‌مانده.` : "کد اشتباه است.";
    }
    return "کد اشتباه است.";
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

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: brand.panel,
  border: `1px solid ${brand.border}`,
  borderRadius: 8,
  padding: 24,
  boxSizing: "border-box",
};

const alertStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 6,
  background: brand.dangerBg,
  border: `1px solid ${brand.dangerBorder}`,
  color: brand.danger,
  fontSize: 13,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: `1px solid ${brand.border}`,
  fontSize: 15,
  boxSizing: "border-box",
  fontFamily: brand.fontFamily,
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnPrimary,
  width: "100%",
};

const btnGhost: React.CSSProperties = {
  ...btnSecondary,
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
      setError("درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.");
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
      setStoredToken(r.data.access_token);
      navigate("/workspace-select", { replace: true });
      return;
    }
    const details = r.details as VerifyDetails | undefined;
    setError(otpErrorMessage(details, loginErrorMessage(r.code, r.message)));
  }, [mobile, otp, navigate, validateAll, otpValidators]);

  if (checkingSession) {
    return (
      <LoginShell>
        <LoginCard>
          <p style={{ margin: 0, color: "#6B7280", fontSize: 14 }}>در حال بررسی نشست…</p>
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
        <h1 style={{ margin: "0 0 4px", fontSize: 18, color: brand.primaryDark, fontWeight: 700, textAlign: "center" }}>
          {brandNames.panel.title}
        </h1>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: brand.textMuted, textAlign: "center" }}>
          {brandNames.tagline} — ورود با موبایل
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
          {step === 1
            ? "شماره موبایل خود را وارد کنید تا کد یک‌بارمصرف ارسال شود."
            : `کد ارسال‌شده به ${mobile} را وارد کنید.`}
        </p>

        {error && (
          <div role="alert" style={alertStyle}>
            {error}
          </div>
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
              hint="۹ تا ۱۵ رقم، مثلاً 09121234567"
              htmlFor="login-mobile"
            >
              <input
                id="login-mobile"
                data-testid="login-mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="09121234567"
                value={mobile}
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
            <button
              data-testid="login-request-otp"
              type="submit"
              disabled={busy || !mobileValid}
              style={{ ...btnPrimaryStyle, opacity: busy || !mobileValid ? 0.65 : 1 }}
            >
              {busy ? "در حال ارسال…" : "دریافت کد"}
            </button>
          </form>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void verifyOtp();
            }}
          >
            <FormField label="کد ۶ رقمی" required error={otpError} htmlFor="login-otp">
              <input
                id="login-otp"
                data-testid="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="------"
                value={otp}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtp(v);
                  if (otpError) validateField("otp", v, otpValidators);
                }}
                onBlur={() => validateField("otp", otp, otpValidators)}
                disabled={busy}
                aria-invalid={!!otpError}
                style={fieldBorderStyle({ ...inputStyle, letterSpacing: 6, textAlign: "center" }, otpError)}
              />
            </FormField>
            <button
              data-testid="login-verify"
              type="submit"
              disabled={busy || !otpValid}
              style={{ ...btnPrimaryStyle, opacity: busy || !otpValid ? 0.65 : 1 }}
            >
              {busy ? "در حال ورود…" : "ورود"}
            </button>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={busy || resendSec > 0 || !mobileValid}
                onClick={() => void requestOtp()}
                style={btnGhost}
              >
                {resendSec > 0 ? `ارسال مجدد (${resendSec}ث)` : "ارسال مجدد کد"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError(null);
                  setResendSec(0);
                  clearErrors();
                }}
                style={btnGhost}
              >
                تغییر شماره
              </button>
            </div>
          </form>
        )}
        <DemoLoginPanel app="web" />
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
  return <div style={cardStyle}>{children}</div>;
}
