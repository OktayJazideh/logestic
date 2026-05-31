import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetData, getStoredToken, setStoredToken } from "../api";

export function useAuthGuard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    apiGetData<{ id: number; mine_id: number | null }>("/auth/me").then((r) => {
      if (cancelled) return;
      if (!r.ok && r.status === 401) {
        setStoredToken("");
        navigate("/login", { replace: true });
        return;
      }
      if (r.ok && (r.data.mine_id == null || r.data.mine_id === undefined)) {
        navigate("/workspace-select", { replace: true });
        return;
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return { ready };
}
