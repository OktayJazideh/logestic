import React from "react";

export function PanelShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: 16,
        boxSizing: "border-box",
        fontFamily: "sans-serif",
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
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#1B5E20",
              }}
            />
            <div style={{ fontWeight: 700, color: "#0E3B13" }}>{title}</div>
          </div>
          <div style={{ color: "#6B7280", fontSize: 13 }}>MVP • Multi-Mine</div>
        </header>

        <div style={{ display: "flex" }}>
          <aside
            style={{
              width: 260,
              borderLeft: "1px solid #E5E7EB",
              padding: 16,
              background: "#FFFFFF",
            }}
          >
            <div style={{ marginBottom: 10, fontWeight: 700, color: "#111827" }}>منو</div>
            {["داشبورد", "درخواست‌ها", "ماموریت‌ها", "باسکول", "مالی"].map((x) => (
              <div
                key={x}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  marginBottom: 10,
                  color: "#111827",
                  background: "#F9FAFB",
                }}
              >
                {x}
              </div>
            ))}
          </aside>

          <main style={{ flex: 1, padding: 16 }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

