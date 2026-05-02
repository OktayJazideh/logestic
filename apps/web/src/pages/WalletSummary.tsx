import React, { useEffect, useState } from "react";
import { PanelShell } from "../components/PanelShell";
import { apiGet, getStoredToken } from "../api";

export default function WalletSummary() {
  const [owner, setOwner] = useState<string>("");
  const [hh, setHh] = useState<string>("");

  useEffect(() => {
    if (!getStoredToken()) {
      setOwner("توکن تنظیم نشده.");
      return;
    }
    apiGet("/wallet/owner")
      .then((j) => setOwner(JSON.stringify(j, null, 2)))
      .catch(() => setOwner("مالک: نیاز به نقش FLEET_OWNER"));
    apiGet("/wallet/household")
      .then((j) => setHh(JSON.stringify(j, null, 2)))
      .catch(() => setHh("خانوار: نیاز به نقش HOUSEHOLD"));
  }, []);

  return (
    <PanelShell title="خلاصه کیف پول">
      <p style={{ fontSize: 13, color: "#6B7280" }}>بسته به نقش کاربر توکن، یکی از پاسخ‌ها پر می‌شود.</p>
      <h3 style={{ fontSize: 15 }}>مالک ناوگان</h3>
      <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 12, borderRadius: 8, overflow: "auto" }}>{owner}</pre>
      <h3 style={{ fontSize: 15 }}>خانوار</h3>
      <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 12, borderRadius: 8, overflow: "auto" }}>{hh}</pre>
    </PanelShell>
  );
}
