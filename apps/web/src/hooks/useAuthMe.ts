import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { apiGetData, getStoredToken, setStoredToken } from "../api";
import { hasAnyPermission } from "../lib/permissions";
import { permissionsForRole } from "../lib/rolePermissions";

export type AuthMe = {
  id: number;
  mobile_number: string;
  role: string;
  is_active: boolean;
};

export type MyPermissions = {
  role: string;
  permissions: string[];
};

export type PanelOutletContext = {
  tokenVersion: number;
};

export function useAuthMe() {
  const ctx = useOutletContext<PanelOutletContext | null>();
  const tokenVersion = ctx?.tokenVersion ?? 0;
  const [me, setMe] = useState<AuthMe | null>(null);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    if (!getStoredToken()) {
      setMe(null);
      setMyPermissions([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGetData<AuthMe>("/auth/me"),
      apiGetData<MyPermissions>("/auth/myPermissions"),
    ]).then(([meRes, permsRes]) => {
      if (cancelled) return;
      if (meRes.ok) {
        setMe(meRes.data);
        setError(null);
      } else {
        setMe(null);
        setMyPermissions([]);
        if (meRes.status === 401) {
          setStoredToken("");
          setError("نشست منقضی شده. دوباره وارد شوید.");
        } else {
          setError(meRes.message);
        }
      }
      if (permsRes.ok && permsRes.data.permissions.length > 0) {
        const fromApi = permsRes.data.permissions;
        const fallback = meRes.ok ? permissionsForRole(meRes.data.role) : [];
        const merged = [...new Set([...fromApi, ...fallback])];
        setMyPermissions(merged);
      } else if (meRes.ok) {
        setMyPermissions(permissionsForRole(meRes.data.role));
      } else {
        setMyPermissions([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenVersion]);

  const can = useCallback(
    (required: string | string[]) => hasAnyPermission(myPermissions, required),
    [myPermissions],
  );

  return {
    me,
    error,
    hasToken: Boolean(getStoredToken()),
    myPermissions,
    ready: !loading && (Boolean(me) || !getStoredToken()),
    can,
  };
}
