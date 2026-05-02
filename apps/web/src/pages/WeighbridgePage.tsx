import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, getStoredToken } from "../api";

type TicketRow = {
  id: number;
  mission_id: number;
  ticket_number: string;
  status: string;
  empty_weight?: number;
  loaded_weight?: number;
  net_weight?: number;
  created_at?: string;
};

type AdjRow = {
  id: number;
  ticket_id: number;
  mission_id: number;
  reason: string;
  before_net: number;
  after_net: number;
  status: string;
  created_at?: string;
};

export default function WeighbridgePage() {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [adj, setAdj] = useState<AdjRow[] | null>(null);
  const [errT, setErrT] = useState<string | null>(null);
  const [errA, setErrA] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setErrT("توکن تنظیم نشده.");
      return;
    }
    apiGetData<{ tickets: TicketRow[] }>("/weighbridge/tickets").then((r) => {
      if (r.ok) {
        setTickets(r.data.tickets);
        setErrT(null);
      } else {
        setTickets(null);
        setErrT(r.message);
      }
    });
    apiGetData<{ adjustments: AdjRow[] }>("/weighbridge/adjustments").then((r) => {
      if (r.ok) {
        setAdj(r.data.adjustments);
        setErrA(null);
      } else {
        setAdj(null);
        setErrA(r.message);
      }
    });
  }, []);

  return (
    <PageFrame
      title="باسکول و مغایرت"
      expectedRoles={["CONSULTANT", "COOP", "ADMIN"]}
      intro={
        <>
          مشاهده تیکت‌ها و درخواست‌های اصلاح وزن. ثبت وزن و تأیید از طریق APIهای{" "}
          <code style={{ fontSize: 12 }}>POST …/weights</code> و مسیرهای تأیید/رد طبق نقش مشاور یا اپراتور انجام
          می‌شود؛ این صفحه فقط نمایش حداقلی برای MVP است.
        </>
      }
    >
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>تیکت‌ها</h3>
      {errT && <div style={{ color: "#B45309", marginBottom: 8, fontSize: 14 }}>{errT}</div>}
      {tickets && tickets.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 22 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>تیکت</th>
                <th style={th}>ماموریت</th>
                <th style={th}>وضعیت</th>
                <th style={th}>وزن خالی</th>
                <th style={th}>وزن پر</th>
                <th style={th}>خالص</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{t.ticket_number}</td>
                  <td style={td}>{t.mission_id}</td>
                  <td style={td}>{t.status}</td>
                  <td style={td}>{t.empty_weight ?? "—"}</td>
                  <td style={td}>{t.loaded_weight ?? "—"}</td>
                  <td style={td}>{t.net_weight ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tickets && tickets.length === 0 && !errT && (
        <p style={{ color: "#6B7280", fontSize: 14 }}>تیکتی برای نمایش نیست.</p>
      )}

      <h3 style={{ fontSize: 15, marginBottom: 8 }}>درخواست‌های اصلاح وزن</h3>
      {errA && <div style={{ color: "#B45309", marginBottom: 8, fontSize: 14 }}>{errA}</div>}
      {adj && adj.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
            <thead>
              <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                <th style={th}>شناسه</th>
                <th style={th}>تیکت</th>
                <th style={th}>وضعیت</th>
                <th style={th}>قبل</th>
                <th style={th}>بعد</th>
                <th style={th}>دلیل</th>
              </tr>
            </thead>
            <tbody>
              {adj.map((a) => (
                <tr key={a.id}>
                  <td style={td}>{a.id}</td>
                  <td style={td}>{a.ticket_id}</td>
                  <td style={td}>{a.status}</td>
                  <td style={td}>{a.before_net}</td>
                  <td style={td}>{a.after_net}</td>
                  <td style={td}>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adj && adj.length === 0 && !errA && (
        <p style={{ color: "#6B7280", fontSize: 14 }}>درخواست اصلاحی ثبت نشده.</p>
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
