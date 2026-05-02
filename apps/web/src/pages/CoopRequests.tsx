import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { MineScope } from "../components/MineScope";
import { apiGetData, getStoredToken } from "../api";

type RateCardRow = {
  operation_type: string;
  material_type: string;
  unit_type: string;
  rate: number;
  effectiveFrom: string;
  status: string;
};

type VillageRow = { id: number; mine_id: number; name: string; district?: string };

export default function CoopRequests() {
  const [rates, setRates] = useState<RateCardRow[] | null>(null);
  const [villages, setVillages] = useState<VillageRow[] | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);
  const [vilErr, setVilErr] = useState<string | null>(null);

  function loadVillages() {
    if (!getStoredToken()) return;
    apiGetData<{ villages: VillageRow[] }>("/villages").then((r) => {
      if (r.ok) {
        setVillages(r.data.villages);
        setVilErr(null);
      } else {
        setVillages(null);
        setVilErr(r.message);
      }
    });
  }

  useEffect(() => {
    if (!getStoredToken()) return;
    apiGetData<{ rate_cards: RateCardRow[] }>("/rate-cards").then((r) => {
      if (r.ok) {
        setRates(r.data.rate_cards);
        setRateErr(null);
      } else {
        setRates(null);
        setRateErr(r.message);
      }
    });
    loadVillages();
  }, []);

  return (
    <PageFrame
      title="درخواست‌ها و دادهٔ پایه — تعاونی"
      expectedRoles={["COOP", "ADMIN"]}
      intro="نقش COOP: انتخاب معدن فعال، مشاهده روستاهای همان معدن و نرخ‌های مصوب. تأیید راننده/خانوار در مسیر جداگانه‌ی ثبت‌نام است."
    >
      <MineScope onMineSelected={() => loadVillages()} />

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#111827" }}>نرخ‌های فعال</div>
        {rateErr && <div style={{ color: "#B45309", fontSize: 14 }}>{rateErr}</div>}
        {rates && rates.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>ماده</th>
                <th style={th}>واحد</th>
                <th style={th}>نرخ</th>
                <th style={th}>از تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((row) => (
                <tr key={`${row.material_type}-${row.effectiveFrom}`}>
                  <td style={td}>{row.material_type}</td>
                  <td style={td}>{row.unit_type}</td>
                  <td style={td}>{row.rate.toLocaleString("fa-IR")}</td>
                  <td style={td}>{row.effectiveFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rates && rates.length === 0 && <div style={{ color: "#6B7280" }}>نرخی ثبت نشده.</div>}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#111827" }}>روستاهای معدن انتخاب‌شده</div>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>
          پس از «ثبت معدن فعال»، فهرست روستا از سشن خوانده می‌شود. اگر خالی بود ابتدا معدن را ثبت کنید.
        </p>
        {vilErr && <div style={{ color: "#B45309", fontSize: 14 }}>{vilErr}</div>}
        {villages && villages.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>نام</th>
                <th style={th}>ناحیه</th>
                <th style={th}>شناسه</th>
              </tr>
            </thead>
            <tbody>
              {villages.map((v) => (
                <tr key={v.id}>
                  <td style={td}>{v.name}</td>
                  <td style={td}>{v.district ?? "—"}</td>
                  <td style={td}>{v.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {villages && villages.length === 0 && (
          <div style={{ color: "#6B7280", fontSize: 14 }}>هنوز روستایی برای این معدن نیست یا معدن انتخاب نشده.</div>
        )}
      </div>
    </PageFrame>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  fontWeight: 700,
};
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
