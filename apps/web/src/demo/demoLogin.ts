import { apiPostPublic, setStoredToken } from "../api";
import { fetchDevOtp } from "./demoUsers";
import type { DemoPersona } from "./demoUsers";

export type DemoLoginResult =
  | { ok: true; mobile: string; role: string }
  | { ok: false; message: string };

/** One-click OTP login for seeded demo users (requires NODE_ENV≠production + db:seed). */
export async function demoLogin(persona: DemoPersona): Promise<DemoLoginResult> {
  const mobile = persona.mobile;

  const otpReq = await apiPostPublic<{ expires_in_seconds: number }>("/auth/request-otp", {
    mobile_number: mobile,
  });
  if (!otpReq.ok) {
    return { ok: false, message: otpReq.message };
  }

  const code = await fetchDevOtp(mobile);
  if (!code) {
    return {
      ok: false,
      message: "کد OTP از سرور dev در دسترس نیست. NODE_ENV=development و db:seed را چک کنید.",
    };
  }

  const verify = await apiPostPublic<{ access_token: string; role: string }>("/auth/verify-otp", {
    mobile_number: mobile,
    otp_code: code,
  });
  if (!verify.ok) {
    return { ok: false, message: verify.message };
  }

  setStoredToken(verify.data.access_token);
  return { ok: true, mobile, role: verify.data.role };
}
