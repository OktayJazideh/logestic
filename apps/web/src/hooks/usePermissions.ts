import { useAuthMe } from "./useAuthMe";

/** Permission checks from `/auth/myPermissions` (RBAC matrix). */
export function usePermissions() {
  const { can, myPermissions, ready } = useAuthMe();
  return {
    permissions: myPermissions,
    ready,
    can,
    canDispatch: can("dispatch:create"),
  };
}
