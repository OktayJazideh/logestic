import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField, fieldBorderStyle } from "../components/FormField";
import { useFieldValidation } from "../hooks/useFieldValidation";
import { apiGetData, apiPostPublic, getRememberMePreference, getStoredToken, setRememberMePreference, setStoredToken } from "../api";
import { mobileNumber, otpCode, required, runValidators } from "../lib/validation";
import { BrandLogo } from "../components/BrandLogo";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { loginErrorMessage } from "../lib/authMessages";
import { brandNames } from "../brand";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { Button, Input } from "../components/ui";
import { simpleLabel } from "../lib/uiLabels";
import { resolvePostAuthNavigation } from "../lib/workspaceFlow";
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
  background: brand.bg,
  fontFamily: brand.fontFamily,
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
  const [step, setStep] = useState<1 | 2 | "password">(1);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    resolvePostAuthNavigation(navigate, { replace: true }).then((handled) => {
      if (cancelled) return;
      if (handled) return;
      setStoredToken("");
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
      await resolvePostAuthNavigation(navigate, { replace: true });
      return;
    }
    const details = r.details as VerifyDetails | undefined;
    setError(otpErrorMessage(details, loginErrorMessage(r.code, r.message)));
  }, [mobile, otp, navigate, validateAll, otpValidators, rememberMe]);

  const loginWithPassword = useCallback(async () => {
    const u = username.trim();
    const p = password;
    if (!u || p.length < 6) {
      setError("نام کاربری و رمز عبور (حداقل ۶ کاراکتر) را وارد کنید.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiPostPublic<{ access_token: string; role: string }>("/auth/login-password", {
      username: u,
      password: p,
    });
    setBusy(false);
    if (r.ok) {
      setStoredToken(r.data.access_token, rememberMe);
      await resolvePostAuthNavigation(navigate, { replace: true });
      return;
    }
    setError(apiErrorMessageFa(r.code, r.message));
  }, [username, password, navigate, rememberMe]);

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

  const errorActionHint =
    step === 2
      ? "«ارسال دوباره» یا «تغییر شماره»."
      : step === "password"
        ? "نام کاربری و رمز را بررسی کنید. اگر خطا ادامه داشت، deploy سرور را بررسی کنید."
        : "شماره ثبت‌شده را وارد کنید.";

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
          {step === 1
            ? "شماره موبایل ثبت‌شده را وارد کنید."
            : step === 2
              ? "کد ۶ رقمی پیامک‌شده را وارد کنید."
              : "نام کاربری و رمز عبور خود را وارد کنید."}
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
            actionHint={errorActionHint}
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
            <Button
              data-testid="login-password-mode"
              type="button"
              variant="secondary"
              fullWidth
              disabled={busy}
              style={{ marginTop: 10 }}
              onClick={() => {
                setStep("password");
                setError(null);
                clearErrors();
              }}
            >
              ورود با نام کاربری و رمز
            </Button>
            <MobileDownloadLinks />
          </form>
        ) : step === 2 ? (
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
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void loginWithPassword();
            }}
          >
            <FormField label="نام کاربری" required htmlFor="login-username">
              <Input
                id="login-username"
                data-testid="login-username"
                type="text"
                autoComplete="username"
                placeholder="oktay"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
                style={inputStyle}
              />
            </FormField>
            <FormField label="رمز عبور" required htmlFor="login-password">
              <Input
                id="login-password"
                data-testid="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                style={inputStyle}
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
                checked={rememberMe}
                onChange={(e) => {
                  setRememberMe(e.target.checked);
                  setRememberMePreference(e.target.checked);
                }}
                disabled={busy}
              />
              مرا به خاطر بسپار
            </label>
            <Button data-testid="login-password-submit" type="submit" fullWidth disabled={busy}>
              {busy ? "در حال ورود…" : "ورود"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              fullWidth
              disabled={busy}
              style={{ marginTop: 10 }}
              onClick={() => {
                setStep(1);
                setPassword("");
                setError(null);
              }}
            >
              بازگشت به ورود با پیامک
            </Button>
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
    <div className="auth-page" style={pageStyle} dir="rtl">
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
