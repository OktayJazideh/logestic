import React, { useEffect, useState } from "react";
import { PanelShell } from "../components/PanelShell";
import { apiGet, getStoredToken } from "../api";

export default function MissionBoard() {
  const [raw, setRaw] = useState<string>("");

  useEffect(() => {
    if (!getStoredToken()) {
      setRaw("توکن تنظیم نشده.");
      return;
    }
    apiGet("/rate-cards")
      .then((j) => setRaw(JSON.stringify(j, null, 2)))
      .catch((e) => setRaw(String(e)));
  }, []);

  return (
    <PanelShell title="بورد ماموریت / نرخ">
      <p style={{ fontSize: 13, color: "#6B7280" }}>
        نمایش نرخ‌های فعال (نیاز به توکن). برای لیست ماموریت‌های سراسری endpoint اختصاصی بعداً اضافه می‌شود.
      </p>
      <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 12, borderRadius: 8, overflow: "auto" }}>{raw}</pre>
    </PanelShell>
  );
}
