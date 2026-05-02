import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, getStoredToken } from "../api";

type WalletPayload = {
  wallet: { id: number; wallet_type: string; active?: boolean };
  balance: number;
  transactions: Array<{
    id: number;
    amount: number;
    type: string;
    description?: string;
    mission_id?: number;
    created_at?: string;
  }>;
};

export default function WalletSummary() {
  const [owner, setOwner] = useState<WalletPayload | null>(null);
  const [household, setHousehold] = useState<WalletPayload | null>(null);
  const [errO, setErrO] = useState<string | null>(null);
  const [errH, setErrH] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setErrO("توکن تنظیم نشده.");
      setErrH("توکن تنظیم نشده.");
      return;
    }
    apiGetData<WalletPayload>("/wallet/owner").then((r) => {
      if (r.ok) {
        setOwner(r.data);
        setErrO(null);
      } else {
        setOwner(null);
        setErrO(r.message);
      }
    });
    apiGetData<WalletPayload>("/wallet/household").then((r) => {
      if (r.ok) {
        setHousehold(r.data);
        setErrH(null);
      } else {
        setHousehold(null);
        setErrH(r.message);
      }
    });
  }, []);

  return (
    <PageFrame
      title="خلاصه کیف پول"
      expectedRoles={["FLEET_OWNER", "HOUSEHOLD", "ADMIN"]}
      intro="برای دادهٔ واقعی از توکن نقش FLEET_OWNER یا HOUSEHOLD استفاده کنید؛ پاسخ هر endpoint با نقش شما سنجیده می‌شود."
    >
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>مالک ناوگان</h3>
        {errO && <div style={{ color: "#B45309", fontSize: 14 }}>{errO}</div>}
        {owner && (
          <>
            <div style={{ marginBottom: 10, fontSize: 14 }}>
              موجودی: <strong>{owner.balance.toLocaleString("fa-IR")}</strong> — کیف{" "}
              <strong>{owner.wallet.id}</strong> ({owner.wallet.wallet_type})
            </div>
            {owner.transactions.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>نوع</th>
                    <th style={th}>مبلغ</th>
                    <th style={th}>ماموریت</th>
                    <th style={th}>شرح</th>
                  </tr>
                </thead>
                <tbody>
                  {owner.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={td}>{tx.type}</td>
                      <td style={td}>{tx.amount.toLocaleString("fa-IR")}</td>
                      <td style={td}>{tx.mission_id ?? "—"}</td>
                      <td style={td}>{tx.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#6B7280", fontSize: 14 }}>تراکنشی ثبت نشده.</div>
            )}
          </>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>خانوار</h3>
        {errH && <div style={{ color: "#B45309", fontSize: 14 }}>{errH}</div>}
        {household && (
          <>
            <div style={{ marginBottom: 10, fontSize: 14 }}>
              موجودی: <strong>{household.balance.toLocaleString("fa-IR")}</strong> — کیف{" "}
              <strong>{household.wallet.id}</strong> ({household.wallet.wallet_type})
            </div>
            {household.transactions.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>نوع</th>
                    <th style={th}>مبلغ</th>
                    <th style={th}>ماموریت</th>
                    <th style={th}>شرح</th>
                  </tr>
                </thead>
                <tbody>
                  {household.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={td}>{tx.type}</td>
                      <td style={td}>{tx.amount.toLocaleString("fa-IR")}</td>
                      <td style={td}>{tx.mission_id ?? "—"}</td>
                      <td style={td}>{tx.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#6B7280", fontSize: 14 }}>تراکنشی ثبت نشده.</div>
            )}
          </>
        )}
      </section>
    </PageFrame>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  fontWeight: 700,
};
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
