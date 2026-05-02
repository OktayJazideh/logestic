import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, getStoredToken } from "../api";

type RateCardRow = {
  operation_type: string;
  material_type: string;
  unit_type: string;
  rate: number;
  effectiveFrom: string;
  status: string;
};

export default function MissionBoard() {
  const [rows, setRows] = useState<RateCardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setErr("توکن تنظیم نشده.");
      return;
    }
    apiGetData<{ rate_cards: RateCardRow[] }>("/rate-cards").then((r) => {
      if (r.ok) {
        setRows(r.data.rate_cards);
        setErr(null);
      } else {
        setRows(null);
        setErr(r.message);
      }
    });
  }, []);

  return (
    <PageFrame
      title="بورد ماموریت / نرخ"
      expectedRoles={["COOP", "EMPLOYER", "CONSULTANT", "ADMIN"]}
      intro="جدول نرخ‌های فعال برای عملیات حمل تنی. لیست سراسری ماموریت‌ها در صورت افزوده شدن endpoint مدیریتی به همین جدول الصاق می‌شود."
    >
      {err && (
        <div style={{ color: "#B45309", marginBottom: 12, fontSize: 14 }}>
          {err}
        </div>
      )}
      {rows && rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
              <th style={th}>نوع عملیات</th>
              <th style={th}>ماده</th>
              <th style={th}>واحد</th>
              <th style={th}>نرخ</th>
              <th style={th}>موثر از</th>
              <th style={th}>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.material_type}-${row.effectiveFrom}`}>
                <td style={td}>{row.operation_type}</td>
                <td style={td}>{row.material_type}</td>
                <td style={td}>{row.unit_type}</td>
                <td style={td}>{row.rate.toLocaleString("fa-IR")}</td>
                <td style={td}>{row.effectiveFrom}</td>
                <td style={td}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && rows.length === 0 && !err && (
        <div style={{ color: "#6B7280" }}>نرخی برای نمایش نیست.</div>
      )}
    </PageFrame>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  fontWeight: 700,
};
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
