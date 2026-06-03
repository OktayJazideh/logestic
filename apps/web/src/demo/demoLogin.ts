import { apiPostData, apiPostPublic, setStoredToken } from "../api";
import type { DemoPersona } from "./demoUsers";

export type DemoLoginResult =
  | { ok: true; mobile: string; role: string }
  | { ok: false; message: string };

/** One-click login for seeded demo users — no SMS/OTP (requires NODE_ENV≠production + db:seed). */
export async function demoLogin(persona: DemoPersona): Promise<DemoLoginResult> {
  const mobile = persona.mobile;

  const login = await apiPostPublic<{ access_token: string; role: string }>("/auth/__dev/login", {
    mobile_number: mobile,
  });
  if (!login.ok) {
    return { ok: false, message: login.message };
  }

  setStoredToken(login.data.access_token, true);

  const ws = persona.workspace;
  if (ws) {
    const sel = await apiPostData<{ mine_id: number }>("/workspaces/select", {
      mine_id: ws.mine_id,
      membership_kind: ws.membership_kind,
      ...(ws.cooperative_id != null ? { cooperative_id: ws.cooperative_id } : {}),
    });
    if (!sel.ok) {
      return { ok: false, message: `انتخاب فضای کاری: ${sel.message}` };
    }
  }

  return { ok: true, mobile, role: login.data.role };
}
