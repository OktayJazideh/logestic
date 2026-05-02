import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiGetData, getStoredToken } from "../api";

export type AuthMe = {
  id: number;
  mobile_number: string;
  role: string;
  is_active: boolean;
};

export type PanelOutletContext = {
  tokenVersion: number;
};

export function useAuthMe() {
  const ctx = useOutletContext<PanelOutletContext | null>();
  const tokenVersion = ctx?.tokenVersion ?? 0;
  const [me, setMe] = useState<AuthMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setMe(null);
      setError(null);
      return;
    }
    let cancelled = false;
    apiGetData<AuthMe>("/auth/me").then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setMe(r.data);
        setError(null);
      } else {
        setMe(null);
        setError(r.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenVersion]);

  return { me, error, hasToken: Boolean(getStoredToken()) };
}
