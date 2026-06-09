import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { setStoredToken } from "../api";
import { PANEL_NAV, navForRole, type NavItem } from "../config/panelNav";
import { PanelSessionProvider, usePanelSession } from "../context/PanelSessionContext";
import { useAuthGuard } from "../hooks/useAuthGuard";
import type { PanelOutletContext } from "../hooks/useAuthMe";
import { useAuthMe } from "../hooks/useAuthMe";
import { BrandLogo } from "./BrandLogo";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { dashboardBannerFa } from "../lib/roleLabels";
import { Button } from "./ui";
import { brand } from "../theme";

const MOBILE_NAV_MQ = "(max-width: 900px)";

/** Layout wrapper با Outlet برای مسیرهای تو در تو */
export function PanelLayout() {
  return (
    <PanelSessionProvider>
      <PanelLayoutInner />
    </PanelSessionProvider>
  );
}

function PanelLayoutInner() {
  const navigate = useNavigate();
  const { ready: guardReady } = useAuthGuard();
  const { ready: authReady, can, me } = useAuthMe();
  const { tokenVersion, bumpSession } = usePanelSession();

  const ctx: PanelOutletContext = useMemo(() => ({ tokenVersion }), [tokenVersion]);
  const navItems = navForRole(PANEL_NAV, me?.role, can);

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
      <PanelShellInner
        onLogout={handleLogout}
        navItems={navItems}
        userRole={me?.role}
        activeMineId={me?.mine_id}
        tokenVersion={tokenVersion}
        onWorkspaceChanged={bumpSession}
        ctx={ctx}
      />
    </div>
  );
}

type InnerProps = {
  onLogout: () => void;
  navItems: NavItem[];
  userRole?: string;
  activeMineId?: number | null;
  tokenVersion: number;
  onWorkspaceChanged: () => void;
  ctx: PanelOutletContext;
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            isActive ? "panel-nav__link panel-nav__link--active" : "panel-nav__link"
          }
          onClick={onNavigate}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

function PanelShellInner({
  onLogout,
  navItems,
  userRole,
  activeMineId,
  tokenVersion,
  onWorkspaceChanged,
  ctx,
}: InnerProps) {
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
        <div className="panel-shell__header-actions">
          <WorkspaceSwitcher
            userRole={userRole}
            activeMineId={activeMineId}
            tokenVersion={tokenVersion}
            onWorkspaceChanged={onWorkspaceChanged}
            compact={isMobileNav}
          />
          <Button
            variant="secondary"
            onClick={onLogout}
            className="panel-shell__logout-btn"
            style={{ background: brand.panel, borderColor: brand.border }}
          >
            {isMobileNav ? "خروج" : "خروج از حساب"}
          </Button>
        </div>
      </header>

      <div className="panel-shell__role-banner" data-testid="panel-role-banner">
        {dashboardBannerFa(userRole)}
      </div>

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
          <nav aria-label="منوی اصلی">
            <NavLinks items={navItems} onNavigate={closeMenu} />
          </nav>
        </aside>

        <main className="panel-shell__main">
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}
