import React, { useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiPostData } from "../api";

export default function PaymentControlPage() {
  const [missionId, setMissionId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: "hold" | "release" | "reversal") {
    setMsg(null);
    const id = Number(missionId);
    if (!Number.isFinite(id) || id <= 0) {
      setMsg("Mission ID نامعتبر است.");
      return;
    }
    const r = await apiPostData<{ mission: { payment_state: string } }>(`/missions/${id}/payment/${action}`, {
      reason: reason || `manual_${action}`,
    });
    if (r.ok) {
      setMsg(`انجام شد. payment_state = ${r.data.mission.payment_state}`);
    } else {
      setMsg(`خطا: ${r.message}`);
    }
  }

  return (
    <PageFrame title="کنترل HOLD / Release / Reversal" expectedRoles={["OPERATION_ADMIN", "ADMIN"]}>
      <p style={{ color: "#6B7280", marginTop: 0 }}>
        برای سناریوهای مشکوک طبق تصمیم کارفرما: Hold، Release یا Reversal با ثبت دلیل. مبالغ مالی در
        صفحات تسویه و مالی با تومان (از ریال API) نمایش داده می‌شوند.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          placeholder="Mission ID"
          style={{ padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 8, width: 140 }}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="دلیل"
          style={{ padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 8, minWidth: 260 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => call("hold")}>HOLD</button>
        <button onClick={() => call("release")}>RELEASE</button>
        <button onClick={() => call("reversal")}>REVERSAL</button>
      </div>
      {msg && <div style={{ marginTop: 10, color: "#374151" }}>{msg}</div>}
    </PageFrame>
  );
}

