import React from "react";
import { PanelShell } from "../components/PanelShell";

export default function CoopRequests() {
  return (
    <PanelShell title="درخواست‌های تعاونی (Coop)">
      <p style={{ color: "#6B7280" }}>
        نقش COOP: فهرست ثبت‌نام و تأیید خانوار/ناوگان از طریق APIهای آینده یا همین پنل تکمیل می‌شود. فعلاً placeholder
        عملیاتی با Layout نهایی.
      </p>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, background: "#F9FAFB" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>وضعیت اتصال</div>
        <div style={{ fontSize: 13 }}>Endpoint اختصاصی COOP در بک‌اند در صف backlog؛ UI آماده اتصال است.</div>
      </div>
    </PanelShell>
  );
}
