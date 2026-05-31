import React from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { useAuthMe } from "../hooks/useAuthMe";
import { PLATFORM_LEGAL_TERMS_FA } from "../lib/platformLegal";

const card = {
  display: "block" as const,
  padding: 14,
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  textDecoration: "none" as const,
  color: "#111827",
  marginBottom: 10,
};

const HSA_GUIDE_ROLES = new Set(["OPERATION_ADMIN", "COOP_ADMIN"]);

export default function PanelHome() {
  const { me, error, hasToken } = useAuthMe();
  const showHsaGuide = me?.role != null && HSA_GUIDE_ROLES.has(me.role);

  return (
    <PageFrame
      title="پنل عملیاتی MVP"
      intro={
        <>
          با ورود OTP موبایل وارد شده‌اید. هر بخش برای نقش مشخص در چک‌لیست MVP (تعاونی، کارفرما، باسکول،
          مالک/خانوار) حداقلی عملیاتی است.
        </>
      }
    >
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #D1D5DB",
          background: "#FFFFFF",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#111827" }}>وضعیت نشست</div>
        {!hasToken && <div style={{ fontSize: 14, color: "#6B7280" }}>نشست فعال نیست.</div>}
        {hasToken && error && <div style={{ fontSize: 14, color: "#B45309" }}>{error}</div>}
        {hasToken && me && (
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <div>
              نقش: <strong>{me.role}</strong>
            </div>
            <div>موبایل: {me.mobile_number}</div>
          </div>
        )}
      </div>

      {showHsaGuide && (
        <details
          data-testid="hsa-human-role-guide"
          dir="rtl"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #BFDBFE",
            background: "#F3F1EB",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 700,
              color: "#1E3A8A",
              listStylePosition: "inside",
            }}
          >
            راهنمای نقش انسان در سیستم (HSA-MATRIX)
          </summary>
          <ul
            style={{
              margin: "10px 0 0",
              paddingInlineStart: 20,
              fontSize: 13,
              lineHeight: 1.85,
              color: "#1E40AF",
            }}
          >
            <li>
              <strong>محاسبه ۹۹/۱</strong>، Community (تن×ثابت) و Draft صورت وضعیت — سیستم خودکار؛ شما{" "}
              <strong>بازبینی → تأیید → Lock</strong> (INVOICE-DRAFT + GOV-WORKFLOW).
            </li>
            <li>
              <strong>Dispatch</strong> و <strong>KYC</strong> کاملاً دستی — تخصیص مأموریت و تأیید/رد درخواست‌ها.
            </li>
            <li>
              <strong>واریز بانک:</strong> سیستم فایل Excel می‌دهد؛ واریز واقعی + <strong>mark-paid</strong> و ثبت رسید
              دستی شماست.
            </li>
            <li>
              <strong>Pool distribute:</strong> سیستم سهم را محاسبه می‌کند؛ پرداخت گروهی فقط با{" "}
              <strong>تریگر ادمین</strong> — نه auto-pay بدون Lock؛ راننده <strong>وزن وارد نمی‌کند</strong>.
            </li>
          </ul>
        </details>
      )}

      <div style={{ fontWeight: 700, marginBottom: 10, color: "#111827" }}>بخش‌ها</div>
      <Link to="/panel/coop" style={card}>
        <div style={{ fontWeight: 700 }}>درخواست‌ها — تعاونی (COOP)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>معدن، روستاها، نرخ فعال</div>
      </Link>
      <Link to="/panel/employer" style={card}>
        <div style={{ fontWeight: 700 }}>نیاز کارفرما (EMPLOYER)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>ثبت نیاز حمل و دفترچه وضعیت</div>
      </Link>
      <Link to="/panel/missions" style={card}>
        <div style={{ fontWeight: 700 }}>بورد ماموریت / نرخ</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>جدول نرخ‌های فعال</div>
      </Link>
      <Link to="/panel/weighbridge" style={card}>
        <div style={{ fontWeight: 700 }}>باسکول</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>تیکت‌ها و درخواست اصلاح وزن</div>
      </Link>
      <Link to="/panel/payments" style={card}>
        <div style={{ fontWeight: 700 }}>کنترل HOLD / Release / Reversal</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>مدیریت پرداخت‌های مشکوک با دلیل ثبت‌شده</div>
      </Link>
      <Link to="/panel/settlement" style={card}>
        <div style={{ fontWeight: 700 }}>Settlement Batch / Community Pool</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>چرخه قفل بچ، پرداخت و وضعیت pool ماهانه خانوار</div>
      </Link>
      <Link to="/panel/kyc" style={card}>
        <div style={{ fontWeight: 700 }}>صندوق KYC</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>تأیید/رد/تعلیق درخواست‌های PENDING (COOP)</div>
      </Link>
      <Link to="/panel/members" style={card}>
        <div style={{ fontWeight: 700 }}>شفافیت اعضا و اعتراض</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>نمایش عمومی کنترل‌شده و اعتراض مردمی</div>
      </Link>
      <Link to="/panel/wallet" style={card}>
        <div style={{ fontWeight: 700 }}>کیف پول</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>مالک ناوگان یا خانوار با توکن نقش مربوط</div>
      </Link>
      <Link to="/panel/admin/finance" style={card}>
        <div style={{ fontWeight: 700 }}>داشبورد مالی (FIN-UI-1)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
          خلاصه سهم‌ها، نمودار، IBAN ماسک و Export — ADMIN
        </div>
      </Link>
      <Link to="/panel/admin/audit" style={card}>
        <div style={{ fontWeight: 700 }}>مرور Audit (AUDIT-1)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>لاگ دائمی تغییرات — ADMIN / COOP_ADMIN</div>
      </Link>

      <footer
        dir="rtl"
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid #E5E7EB",
          fontSize: 12,
          color: "#6B7280",
          lineHeight: 1.7,
        }}
      >
        {PLATFORM_LEGAL_TERMS_FA}
      </footer>
    </PageFrame>
  );
}
