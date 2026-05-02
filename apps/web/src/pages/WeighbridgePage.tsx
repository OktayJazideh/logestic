import React, { useEffect, useState } from "react";
import { PanelShell } from "../components/PanelShell";
import { apiGet, getStoredToken } from "../api";

export default function WeighbridgePage() {
  const [tickets, setTickets] = useState<string>("");
  const [adj, setAdj] = useState<string>("");

  useEffect(() => {
    if (!getStoredToken()) {
      setTickets("توکن تنظیم نشده.");
      return;
    }
    apiGet("/weighbridge/tickets")
      .then((j) => setTickets(JSON.stringify(j, null, 2)))
      .catch((e) => setTickets(String(e)));
    apiGet("/weighbridge/adjustments")
      .then((j) => setAdj(JSON.stringify(j, null, 2)))
      .catch(() => setAdj("—"));
  }, []);

  return (
    <PanelShell title="باسکول و مغایرت">
      <p style={{ fontSize: 13, color: "#6B7280" }}>
        نقش CONSULTANT: صف تیکت‌ها و درخواست‌های اصلاح (Q10). ابتدا وزن‌ها را با{" "}
        <code>POST /weighbridge/tickets/:id/weights</code> ثبت کنید سپس تأیید کنید.
      </p>
      <h3 style={{ fontSize: 15 }}>تیکت‌ها</h3>
      <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 12, borderRadius: 8, overflow: "auto" }}>{tickets}</pre>
      <h3 style={{ fontSize: 15 }}>درخواست‌های اصلاح</h3>
      <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 12, borderRadius: 8, overflow: "auto" }}>{adj}</pre>
    </PanelShell>
  );
}
