import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { setStoredToken, getStoredToken } from "../api";

const nav = [
  { to: "/panel", label: "خانه", end: true },
  { to: "/panel/coop", label: "درخواست‌ها (تعاونی)" },
  { to: "/panel/employer", label: "نیاز کارفرما" },
  { to: "/panel/missions", label: "بورد / نرخ" },
  { to: "/panel/weighbridge", label: "باسکول" },
  { to: "/panel/wallet", label: "کیف پول" },
];

export function PanelShell({ title, children }: { title: string; children?: React.ReactNode }) {
  const [tok, setTok] = useState(getStoredToken());

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: 16,
        boxSizing: "border-box",
        fontFamily: "Tahoma, sans-serif",
      }}
      dir="rtl"
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #E5E7EB",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "#1B5E20" }} />
            <div style={{ fontWeight: 700, color: "#0E3B13" }}>{title}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 280px", justifyContent: "flex-end" }}>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Bearer</label>
            <input
              type="password"
              placeholder="توکن"
              value={tok}
              onChange={(e) => setTok(e.target.value)}
              onBlur={() => setStoredToken(tok)}
              style={{
                flex: 1,
                minWidth: 160,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                fontSize: 13,
              }}
            />
          </div>
        </header>

        <div style={{ display: "flex" }}>
          <aside
            style={{
              width: 240,
              borderLeft: "1px solid #E5E7EB",
              padding: 12,
              background: "#FFFFFF",
            }}
          >
            <div style={{ marginBottom: 10, fontWeight: 700, color: "#111827" }}>منو</div>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  marginBottom: 8,
                  textDecoration: "none",
                  color: isActive ? "#1d4ed8" : "#111827",
                  background: isActive ? "#EFF6FF" : "#F9FAFB",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 13,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </aside>

          <main style={{ flex: 1, padding: 16 }}>{children}</main>
        </div>
      </div>
    </div>
  );
}

/** Layout wrapper با Outlet برای مسیرهای تو در تو */
export function PanelLayout() {
  const [tok, setTok] = useState(getStoredToken());

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: 16,
        boxSizing: "border-box",
        fontFamily: "Tahoma, sans-serif",
      }}
      dir="rtl"
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #E5E7EB",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "#1B5E20" }} />
            <div style={{ fontWeight: 700, color: "#0E3B13" }}>پنل MVP</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 280px", justifyContent: "flex-end" }}>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Bearer</label>
            <input
              type="password"
              placeholder="توکن"
              value={tok}
              onChange={(e) => setTok(e.target.value)}
              onBlur={() => setStoredToken(tok)}
              style={{
                flex: 1,
                minWidth: 160,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                fontSize: 13,
              }}
            />
          </div>
        </header>

        <div style={{ display: "flex" }}>
          <aside
            style={{
              width: 240,
              borderLeft: "1px solid #E5E7EB",
              padding: 12,
              background: "#FFFFFF",
            }}
          >
            <div style={{ marginBottom: 10, fontWeight: 700, color: "#111827" }}>منو</div>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  marginBottom: 8,
                  textDecoration: "none",
                  color: isActive ? "#1d4ed8" : "#111827",
                  background: isActive ? "#EFF6FF" : "#F9FAFB",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 13,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </aside>

          <main style={{ flex: 1, padding: 16 }}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
