import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetData, apiPostData, getStoredToken, setStoredToken } from "../api";
import { ErrorBanner } from "../components/simple/ErrorBanner";
import { simpleLabel } from "../lib/uiLabels";
import { brand, btnSecondary } from "../theme";

export type WorkspaceRow = {
  membership_kind: "COMMUNITY" | "OPERATIONAL";
  mine_id: number;
  mine_name: string;
  cooperative_id?: number;
  cooperative_name?: string;
  subtitle: string;
  roles: string[];
};

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
  maxWidth: 480,
  background: brand.panel,
  border: `1px solid ${brand.border}`,
  borderRadius: 8,
  padding: 24,
  boxSizing: "border-box",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "16px 0 8px",
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

function WorkspaceButton({
  ws,
  busy,
  onSelect,
}: {
  ws: WorkspaceRow;
  busy: boolean;
  onSelect: (ws: WorkspaceRow) => void;
}) {
  const testId =
    ws.membership_kind === "COMMUNITY"
      ? `workspace-community-${ws.cooperative_id ?? ws.mine_id}`
      : `workspace-operational-${ws.mine_id}`;

  const kindTitle = ws.membership_kind === "COMMUNITY" ? "تعاونی" : "معدن";
  const kindDesc =
    ws.membership_kind === "COMMUNITY"
      ? `عضویت در تعاونی — ${ws.mine_name}`
      : `کار عملیاتی در ${ws.mine_name}`;

  return (
    <button
      key={`${ws.membership_kind}-${ws.mine_id}-${ws.cooperative_id ?? 0}`}
      type="button"
      className="workspace-kind-card"
      data-testid={testId}
      disabled={busy}
      onClick={() => onSelect(ws)}
    >
      <div className="workspace-kind-card__title">{kindTitle}</div>
      <div className="workspace-kind-card__desc">{kindDesc}</div>
      <div style={{ fontSize: 13, color: brand.textMuted, marginTop: 8 }}>{ws.subtitle}</div>
      <div style={{ fontSize: 12, color: brand.textSoft, marginTop: 4 }}>{ws.roles.join(" · ")}</div>
    </button>
  );
}

export default function WorkspaceSelectPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const community = useMemo(
    () => workspaces.filter((w) => w.membership_kind === "COMMUNITY"),
    [workspaces],
  );
  const operational = useMemo(
    () => workspaces.filter((w) => w.membership_kind === "OPERATIONAL"),
    [workspaces],
  );

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    apiGetData<{ workspaces: WorkspaceRow[] }>("/workspaces").then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setWorkspaces(r.data.workspaces);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const selectWorkspace = useCallback(
    async (ws: WorkspaceRow) => {
      setBusy(true);
      setError(null);
      const r = await apiPostData<{ mine_id: number }>("/workspaces/select", {
        mine_id: ws.mine_id,
        membership_kind: ws.membership_kind,
        ...(ws.cooperative_id != null ? { cooperative_id: ws.cooperative_id } : {}),
      });
      setBusy(false);
      if (r.ok) {
        navigate("/panel", { replace: true });
        return;
      }
      setError(r.message);
    },
    [navigate],
  );

  if (loading) {
    return (
      <div dir="rtl" style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "#6B7280" }}>در حال بارگذاری فضاهای کاری…</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: brand.primaryDark }}>{simpleLabel("workspace")}</h1>
          <button
            type="button"
            data-testid="workspace-logout"
            onClick={() => {
              setStoredToken("");
              navigate("/login", { replace: true });
            }}
            style={{ ...btnSecondary, fontSize: 12, padding: "6px 10px", flexShrink: 0 }}
          >
            خروج از حساب
          </button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 15, color: brand.textMuted, lineHeight: 1.6 }}>
          الان کجا کار می‌کنید؟ یک کارت «معدن» یا «تعاونی» را بزنید.
        </p>

        {error && (
          <ErrorBanner
            message={error}
            actionHint="دوباره همان کارت را انتخاب کنید یا از حساب خارج شوید."
            onRetry={() => setError(null)}
          />
        )}

        {workspaces.length === 0 ? (
          <p style={{ color: "#B45309", fontSize: 13 }}>فضای کاری فعالی برای حساب شما ثبت نشده است.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {operational.length > 0 && (
              <>
                <div style={sectionTitleStyle}>معدن — کار عملیاتی</div>
                {operational.map((w) => (
                  <WorkspaceButton key={`o-${w.mine_id}`} ws={w} busy={busy} onSelect={selectWorkspace} />
                ))}
              </>
            )}
            {community.length > 0 && (
              <>
                <div style={sectionTitleStyle}>تعاونی — عضویت</div>
                {community.map((w) => (
                  <WorkspaceButton key={`c-${w.cooperative_id}-${w.mine_id}`} ws={w} busy={busy} onSelect={selectWorkspace} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
