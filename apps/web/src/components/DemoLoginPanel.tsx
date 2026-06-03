import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { demoLogin } from "../demo/demoLogin";
import { isDemoLoginEnabled, personasForApp, type DemoPersona } from "../demo/demoUsers";
import { brand, btnSecondary } from "../theme";

const panelStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 12,
  borderRadius: 8,
  border: `1px dashed ${brand.border}`,
  background: brand.panelMuted,
};

const chipStyle: React.CSSProperties = {
  ...btnSecondary,
  width: "100%",
  textAlign: "right" as const,
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.45,
};

type Props = {
  app: "web";
};

export function DemoLoginPanel({ app }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!isDemoLoginEnabled()) return null;

  const personas = personasForApp(app);

  async function run(p: DemoPersona) {
    setBusy(p.id);
    setErr(null);
    const r = await demoLogin(p);
    setBusy(null);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    navigate("/panel", { replace: true });
  }

  return (
    <div style={panelStyle} data-testid="demo-login-panel">
      <div style={{ fontWeight: 700, fontSize: 13, color: brand.primaryDark, marginBottom: 6 }}>
        ورود دمو (UAT)
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: brand.textMuted, lineHeight: 1.5 }}>
        یک‌کلیک ورود بدون پیامک — مستقیم به داشبورد. نیاز: دادهٔ اولیه (seed) و حالت توسعه روی سرور.
      </p>
      {err && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: brand.danger }}>
          {err}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`demo-login-${p.id}`}
            disabled={busy != null}
            style={{ ...chipStyle, opacity: busy != null && busy !== p.id ? 0.6 : 1 }}
            onClick={() => void run(p)}
          >
            <div style={{ fontWeight: 700 }}>{p.roleLabel}</div>
            <div style={{ color: brand.textMuted, fontSize: 11 }}>{p.mobile}</div>
            <div style={{ color: brand.textSoft, fontSize: 10 }}>{p.workspaceHint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
