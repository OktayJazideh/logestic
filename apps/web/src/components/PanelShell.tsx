import React, { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { setStoredToken } from "../api";
import { PANEL_NAV, navForRole } from "../config/panelNav";
import { useAuthGuard } from "../hooks/useAuthGuard";
import type { PanelOutletContext } from "../hooks/useAuthMe";
import { useAuthMe } from "../hooks/useAuthMe";
import { BrandLogo } from "./BrandLogo";
import { Button } from "./ui";
import { brand } from "../theme";

const MOBILE_NAV_MQ = "(max-width: 900px)";

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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_NAV_MQ).matches : false,
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [location.pathname, closeMenu]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_NAV_MQ);
    const onChange = () => {
      setIsMobileNav(mq.matches);
      if (!mq.matches) closeMenu();
    };
    setIsMobileNav(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMenu]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className={`panel-shell${menuOpen ? " panel-shell--menu-open" : ""}`}>
      <header className="panel-shell__header">
        <div className="panel-shell__header-start">
          <button
            type="button"
            className="panel-shell__menu-btn"
            aria-expanded={menuOpen}
            aria-controls="panel-sidebar"
            data-testid="panel-menu-toggle"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
          <BrandLogo variant="full" size={40} onDark />
        </div>
        <Button
          variant="secondary"
          onClick={onLogout}
          style={{ background: brand.panel, borderColor: brand.border }}
        >
          خروج از حساب
        </Button>
      </header>

      <div className="panel-shell__body">
        <button
          type="button"
          className="panel-shell__overlay"
          aria-label="بستن منو"
          tabIndex={menuOpen ? 0 : -1}
          onClick={closeMenu}
        />

        <aside
          id="panel-sidebar"
          className="panel-shell__sidebar"
          aria-hidden={isMobileNav ? !menuOpen : false}
        >
          <div className="panel-shell__sidebar-title">منوی اصلی</div>
          <nav>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? "panel-nav__link panel-nav__link--active" : "panel-nav__link"
                }
                onClick={closeMenu}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="panel-shell__main">
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}
