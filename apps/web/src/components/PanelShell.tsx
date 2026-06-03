import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { setStoredToken } from "../api";
import { PANEL_NAV, navForRole } from "../config/panelNav";
import { useAuthGuard } from "../hooks/useAuthGuard";
import type { PanelOutletContext } from "../hooks/useAuthMe";
import { useAuthMe } from "../hooks/useAuthMe";
import { BrandLogo } from "./BrandLogo";
import { Button } from "./ui";
import { brand, fontSize, radius, shadow, space } from "../theme";

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
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${space.md}px ${space.lg}px`,
          background: brand.primaryDark,
          boxShadow: shadow.md,
          flexWrap: "wrap",
          gap: space.sm,
        }}
      >
        <BrandLogo variant="full" size={40} onDark />
        <Button variant="secondary" onClick={onLogout} style={{ background: brand.panel, borderColor: brand.border }}>
          خروج از حساب
        </Button>
      </header>

      <div style={{ display: "flex", flex: 1, alignItems: "stretch" }}>
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            padding: space.md,
            background: brand.sidebarBg,
            borderLeft: `1px solid ${brand.primaryDark}`,
          }}
        >
          <div
            style={{
              marginBottom: space.md,
              fontWeight: 700,
              fontSize: fontSize.sm,
              color: brand.sidebarMuted,
              letterSpacing: "0.02em",
            }}
          >
            منوی اصلی
          </div>
          <nav>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: radius.md,
                  marginBottom: 6,
                  textDecoration: "none",
                  color: isActive ? "#FFFFFF" : brand.sidebarText,
                  background: isActive ? brand.sidebarActive : "transparent",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: fontSize.base,
                  borderRight: isActive ? `3px solid ${brand.primaryMuted}` : "3px solid transparent",
                  transition: "background 0.15s ease",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main
          style={{
            flex: 1,
            padding: space.lg,
            paddingTop: space.xl,
            paddingBottom: space.xl,
            background: brand.bg,
            minWidth: 0,
          }}
        >
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}
