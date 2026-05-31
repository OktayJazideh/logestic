import React from "react";
import { PageFrame } from "../components/PageFrame";

export default function HourlyReviewPage() {
  return (
    <PageFrame
      title="کارکرد ساعتی"
      intro="تأیید و رد کارکرد ساعتی توسط مشاور (CONSULTANT). API: POST /api/hourly/:id/verify"
    >
      <p style={{ color: "#6B7280", fontSize: 14 }}>
        فهرست کارکردها در فاز بعدی به این صفحه متصل می‌شود؛ دسترسی از طریق permission{" "}
        <code>hourly:verify</code> کنترل می‌شود.
      </p>
    </PageFrame>
  );
}
