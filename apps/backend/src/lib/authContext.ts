import { appContext } from "../appContext";
import type { AuthContext } from "../middleware/authMiddleware";
import { resolveTenantScope } from "../middleware/scope";

export async function resolveAuthContext(token: string): Promise<AuthContext | null> {
  const u = await appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = await appContext.sessionStore.getSession(token);
  const scope = await resolveTenantScope(u.id, u.role);
  return {
    token,
    user: {
      id: u.id,
      mobile_number: u.mobile_number,
      role: u.role,
      is_active: u.is_active,
      is_weighbridge_operator: u.is_weighbridge_operator,
      cooperative_id: u.cooperative_id,
    },
    mineId: session?.mineId,
    scope,
  };
}
