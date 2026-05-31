import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { setStoredToken } from "../api";
import { PANEL_NAV, navForRole } from "../config/panelNav";
import { useAuthGuard } from "../hooks/useAuthGuard";
import type { PanelOutletContext } from "../hooks/useAuthMe";
import { useAuthMe } from "../hooks/useAuthMe";
import { brand, btnSecondary } from "../theme";

/** Layout wrapper با Outlet برای مسیرهای تو در تو */
export function PanelLayout() {
  const navigate = useNavigate();
  const { ready: guardReady } = useAuthGuard();
  const { ready: authReady, can, me } = useAuthMe();

  const ctx: PanelOutletContext = { tokenVersion: 0 };
  const nav = navForRole(PANEL_NAV, me?.role, can);

  function handleLogout() {
    setStoredToken("");
    navigate("/login", { replace: true });
  }

  if (!guardReady || !authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.bg,
          fontFamily: brand.fontFamily,
          color: brand.textMuted,
        }}
        dir="rtl"
      >
        در حال بررسی دسترسی…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: brand.bg,
        padding: 16,
        boxSizing: "border-box",
        fontFamily: brand.fontFamily,
        color: brand.text,
      }}
      dir="rtl"
    >
      <PanelShellInner onLogout={handleLogout} nav={nav} ctx={ctx} />
    </div>
  );
}

type InnerProps = {
  onLogout: () => void;
  nav: typeof PANEL_NAV;
  ctx: PanelOutletContext;
};

function PanelShellInner({ onLogout, nav, ctx }: InnerProps) {
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        border: `1px solid ${brand.border}`,
        background: brand.panel,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${brand.border}`,
          background: brand.primaryDark,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: brand.accentLight,
              border: `1px solid ${brand.border}`,
            }}
          />
          <div style={{ fontWeight: 700, color: "#FFFFFF", fontSize: 15 }}>سیستم لجستیک معادن</div>
        </div>
        <button type="button" onClick={onLogout} style={{ ...btnSecondary, background: brand.panelMuted }}>
          خروج
        </button>
      </header>

      <div style={{ display: "flex" }}>
        <aside
          style={{
            width: 240,
            borderLeft: `1px solid ${brand.border}`,
            padding: 12,
            background: brand.panelMuted,
          }}
        >
          <div style={{ marginBottom: 10, fontWeight: 700, color: brand.primaryDark }}>منو</div>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 10px",
                borderRadius: 6,
                border: `1px solid ${isActive ? brand.primary : brand.border}`,
                marginBottom: 8,
                textDecoration: "none",
                color: isActive ? brand.primaryDark : brand.text,
                background: isActive ? brand.primaryLight : brand.panel,
                fontWeight: isActive ? 700 : 400,
                fontSize: 13,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </aside>

        <main style={{ flex: 1, padding: 16, background: brand.panel }}>
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}
