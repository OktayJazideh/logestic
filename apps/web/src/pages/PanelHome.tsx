import React from "react";
import { PanelShell } from "../components/PanelShell";

export default function PanelHome() {
  return (
    <PanelShell title="پنل عملیاتی MVP">
      <p style={{ marginTop: 0, lineHeight: 1.8, color: "#374151" }}>
        برای فراخوانی API، توکن Bearer را از مسیر ورود موبایل/ابزار توسعه بگیرید و در بالای صفحه ذخیره کنید.
      </p>
      <ul style={{ lineHeight: 2 }}>
        <li>تعاونی: صفحه درخواست‌ها</li>
        <li>کارفرما: ثبت نیاز</li>
        <li>بورد ماموریت‌ها</li>
        <li>باسکول: صف تیکت‌ها و تأیید</li>
        <li>کیف پول: خلاصه مالک یا خانوار</li>
      </ul>
    </PanelShell>
  );
}
