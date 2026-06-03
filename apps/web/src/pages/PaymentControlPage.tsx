import React, { useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiPostData } from "../api";
import { labelFa, PAYMENT_STATE_FA } from "../lib/uiLabels";
import { btnPrimary, btnSecondary, brand } from "../theme";

export default function PaymentControlPage() {
  const [missionId, setMissionId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: "hold" | "release" | "reversal") {
    setMsg(null);
    const id = Number(missionId);
    if (!Number.isFinite(id) || id <= 0) {
      setMsg("شماره مأموریت نامعتبر است.");
      return;
    }
    const actionFa =
      action === "hold" ? "نگهداری" : action === "release" ? "آزادسازی" : "برگشت";
    const r = await apiPostData<{ mission: { payment_state: string } }>(`/missions/${id}/payment/${action}`, {
      reason: reason || `دلیل دستی: ${actionFa}`,
    });
    if (r.ok) {
      setMsg(
        `انجام شد. وضعیت پرداخت: ${labelFa(PAYMENT_STATE_FA, r.data.mission.payment_state)}`,
      );
    } else {
      setMsg(`خطا: ${r.message}`);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: `1px solid ${brand.border}`,
    borderRadius: 8,
    fontFamily: brand.fontFamily,
  };

  return (
    <PageFrame title="نگهداری و آزادسازی پرداخت" expectedRoles={["OPERATION_ADMIN", "ADMIN"]}>
      <p style={{ color: brand.textMuted, marginTop: 0, lineHeight: 1.7 }}>
        برای پرداخت‌های مشکوک می‌توانید پرداخت را نگه دارید، آزاد کنید یا برگشت بزنید. حتماً دلیل را
        بنویسید.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 14 }}>
          شماره مأموریت
          <input
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            placeholder="مثلاً ۱۲۳"
            inputMode="numeric"
            style={{ ...inputStyle, display: "block", marginTop: 4, width: 140 }}
          />
        </label>
        <label style={{ fontSize: 14, flex: 1, minWidth: 200 }}>
          دلیل (اختیاری)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="توضیح کوتاه"
            style={{ ...inputStyle, display: "block", marginTop: 4, width: "100%" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btnPrimary} onClick={() => void call("hold")}>
          نگهداری پرداخت
        </button>
        <button type="button" style={btnSecondary} onClick={() => void call("release")}>
          آزادسازی
        </button>
        <button type="button" style={btnSecondary} onClick={() => void call("reversal")}>
          برگشت پرداخت
        </button>
      </div>
      {msg && <div style={{ marginTop: 12, color: brand.text, fontSize: 14 }}>{msg}</div>}
    </PageFrame>
  );
}
