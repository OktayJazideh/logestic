import React from "react";
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { useAuthMe } from "../hooks/useAuthMe";

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

export default function PanelHome() {
  const { me, error, hasToken } = useAuthMe();

  return (
    <PageFrame
      title="پنل عملیاتی MVP"
      intro={
        <>
          توکن Bearer را از ورود OTP موبایل یا محیط توسعه بگیرید و در هدر صفحه ذخیره کنید. هر بخش برای نقش مشخص
          در چک‌لیست MVP (تعاونی، کارفرما، باسکول، مالک/خانوار) حداقلی عملیاتی است.
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
        {!hasToken && <div style={{ fontSize: 14, color: "#6B7280" }}>توکن تنظیم نشده است.</div>}
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

      <div style={{ fontWeight: 700, marginBottom: 10, color: "#111827" }}>بخش‌ها</div>
      <Link to="/panel/coop" style={card}>
        <div style={{ fontWeight: 700 }}>درخواست‌ها — تعاونی (COOP)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>معدن، روستاها، نرخ فعال</div>
      </Link>
      <Link to="/panel/employer" style={card}>
        <div style={{ fontWeight: 700 }}>نیاز کارفرما (EMPLOYER)</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>ثبت نیاز حمل (فرم حداقلی)</div>
      </Link>
      <Link to="/panel/missions" style={card}>
        <div style={{ fontWeight: 700 }}>بورد ماموریت / نرخ</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>جدول نرخ‌های فعال</div>
      </Link>
      <Link to="/panel/weighbridge" style={card}>
        <div style={{ fontWeight: 700 }}>باسکول</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>تیکت‌ها و درخواست اصلاح وزن</div>
      </Link>
      <Link to="/panel/wallet" style={card}>
        <div style={{ fontWeight: 700 }}>کیف پول</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>مالک ناوگان یا خانوار با توکن نقش مربوط</div>
      </Link>
    </PageFrame>
  );
}
