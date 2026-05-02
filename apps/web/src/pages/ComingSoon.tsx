import React from "react";
import { PanelShell } from "../components/PanelShell";

export default function ComingSoon() {
  return (
    <PanelShell title="وب پنل MVP">
      <div style={{ maxWidth: 900 }}>
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            background: "#FFFFFF",
            padding: 16,
          }}
        >
          <h2 style={{ margin: 0, color: "#0E3B13" }}>به زودی...</h2>
          <p style={{ margin: "8px 0 0 0", opacity: 0.85, lineHeight: 1.7 }}>
            اسکلت رسمی پنل‌ها آماده است. در فاز بعدی، صفحات نقش‌محور (Admin/Coop/
            Employer/Owner/Operator) و داده‌های واقعی به این Layout وصل می‌شوند.
          </p>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          {["داشبورد", "ماموریت‌ها", "باسکول", "مالی"].map((x) => (
            <div
              key={x}
              style={{
                flex: "1 1 200px",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                background: "#FFFFFF",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 700, color: "#111827", marginBottom: 8 }}>{x}</div>
              <div style={{ color: "#6B7280", fontSize: 13 }}>
                Placeholder صفحه MVP برای اتصال در مراحل بعد.
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "#111827", marginBottom: 10 }}>نمونه جدول</div>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, background: "#FFFFFF", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["REQ-ID", "تاریخ", "وضعیت", "جزئیات"].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #E5E7EB", fontSize: 13, color: "#6B7280" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {new Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {["REQ-10" + i, "—", "در انتظار", "—"].map((c, idx) => (
                      <td key={idx} style={{ padding: 10, borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

