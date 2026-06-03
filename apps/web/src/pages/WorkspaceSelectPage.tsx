import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetData, apiPostData, getStoredToken, setStoredToken } from "../api";
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

const workspaceButtonStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  cursor: "pointer",
  width: "100%",
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

  return (
    <button
      key={`${ws.membership_kind}-${ws.mine_id}-${ws.cooperative_id ?? 0}`}
      type="button"
      data-testid={testId}
      disabled={busy}
      onClick={() => onSelect(ws)}
      style={{
        ...workspaceButtonStyle,
        cursor: busy ? "not-allowed" : "pointer",
        background: busy ? "#F3F4F6" : "#FFFFFF",
      }}
    >
      <div style={{ fontWeight: 700, color: "#111827" }}>{ws.subtitle}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
        {ws.membership_kind === "COMMUNITY" ? `معدن: ${ws.mine_name}` : ws.mine_name}
      </div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{ws.roles.join(" · ")}</div>
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
          <h1 style={{ margin: 0, fontSize: 20, color: "#0E3B13" }}>انتخاب فضای کاری</h1>
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
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
          عضویت تعاونی و کار عملیاتی در معدن جدا هستند — فقط یکی را برای این نشست انتخاب کنید.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#B91C1C",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {workspaces.length === 0 ? (
          <p style={{ color: "#B45309", fontSize: 13 }}>فضای کاری فعالی برای حساب شما ثبت نشده است.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {community.length > 0 && (
              <>
                <div style={sectionTitleStyle}>عضویت در تعاونی</div>
                {community.map((w) => (
                  <WorkspaceButton key={`c-${w.cooperative_id}-${w.mine_id}`} ws={w} busy={busy} onSelect={selectWorkspace} />
                ))}
              </>
            )}
            {operational.length > 0 && (
              <>
                <div style={sectionTitleStyle}>کار در معدن</div>
                {operational.map((w) => (
                  <WorkspaceButton key={`o-${w.mine_id}`} ws={w} busy={busy} onSelect={selectWorkspace} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
