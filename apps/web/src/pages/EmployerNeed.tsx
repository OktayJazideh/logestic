import React from "react";
import { PanelShell } from "../components/PanelShell";

export default function EmployerNeed() {
  return (
    <PanelShell title="نیاز کارفرما (Employer Need)">
      <p style={{ color: "#6B7280" }}>
        نقش EMPLOYER: ثبت نیاز حمل و اتصال به تخصیص ماموریت. فرم ثبت در نسخه بعد به API <code>/employer/needs</code> وصل
        می‌شود.
      </p>
    </PanelShell>
  );
}
