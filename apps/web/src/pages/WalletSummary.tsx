import React, { useEffect, useMemo, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { apiGetData, getStoredToken } from "../api";
import { formatMoney } from "../lib/formatMoney";

type WalletTx = {
  id: number;
  amount: number;
  type: string;
  description?: string;
  mission_id?: number;
  created_at?: string;
};

type WalletPayload = {
  wallet: { id: number; wallet_type: string; active?: boolean };
  balance: number;
  transactions: WalletTx[];
  community_rial_per_ton?: number;
};

function sumByType(txs: WalletTx[], types: string[]) {
  return txs
    .filter((t) => types.includes(t.type))
    .reduce((sum, t) => sum + (t.amount >= 0 ? t.amount : 0), 0);
}

function WalletSection({
  title,
  intro,
  operationalTotal,
  communityTotal,
  payload,
  error,
  operationalLabel,
  communityLabel,
  communityRatePerTon,
}: {
  title: string;
  intro: string;
  operationalTotal: number;
  communityTotal: number;
  payload: WalletPayload | null;
  error: string | null;
  operationalLabel: string;
  communityLabel: string;
  communityRatePerTon?: number;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>{title}</h3>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>{intro}</p>
      {communityRatePerTon != null && communityRatePerTon > 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#1E3A2F", fontWeight: 600 }}>
          نرخ جاری: {formatMoney(communityRatePerTon)} به ازای هر تن تأییدشده
        </p>
      )}
      {error && <div style={{ color: "#B45309", fontSize: 14, marginBottom: 8 }}>{error}</div>}
      {payload && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div style={dualCardOperational}>
              <div style={{ fontSize: 12, color: "#166534" }}>{operationalLabel}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#14532D", marginTop: 4 }}>
                {formatMoney(operationalTotal)}
              </div>
            </div>
            <div style={dualCardCommunity}>
              <div style={{ fontSize: 12, color: "#1E3A2F" }}>{communityLabel}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1E3A8A", marginTop: 4 }}>
                {formatMoney(communityTotal)}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            موجودی کل: <strong>{formatMoney(payload.balance)}</strong> — کیف{" "}
            <strong>{payload.wallet.id}</strong> ({payload.wallet.wallet_type})
          </div>
          {payload.transactions.length > 0 ? (
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
                {payload.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={td}>{tx.type}</td>
                    <td style={td}>{formatMoney(tx.amount)}</td>
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
  );
}

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

  const ownerOperational = useMemo(
    () => (owner ? sumByType(owner.transactions, ["CREDIT"]) : 0),
    [owner],
  );
  const householdCommunity = useMemo(
    () => (household ? sumByType(household.transactions, ["POOL_DISTRIBUTION"]) : 0),
    [household],
  );

  return (
    <PageFrame
      title="خلاصه کیف پول"
      expectedRoles={["FLEET_OWNER", "HOUSEHOLD", "ADMIN"]}
      intro="دو اقتصاد جدا: عملیاتی (کرایه → مالک + پلتفرم) و جامعه (تن تأییدشده × نرخ ثابت → Pool). بدون نمایش درصد از کرایه."
    >
      <WalletSection
        title="مالک ناوگان"
        intro="جمع واریزهای عملیاتی (CREDIT مرتبط با ماموریت) — مستقل از مشارکت جامعه."
        operationalTotal={ownerOperational}
        communityTotal={0}
        payload={owner}
        error={errO}
        operationalLabel="واریز عملیاتی (جمع CREDIT)"
        communityLabel="مشارکت جامعه (این نقش)"
      />
      <WalletSection
        title="خانوار"
        intro="جمع توزیع‌های Pool (POOL_DISTRIBUTION) — سهم ثابت به ازای تن تأییدشده، نه درصد کرایه."
        operationalTotal={0}
        communityTotal={householdCommunity}
        payload={household}
        error={errH}
        operationalLabel="عملیاتی (این نقش)"
        communityLabel="مشارکت جامعه دریافتی (جمع POOL_DISTRIBUTION)"
        communityRatePerTon={household?.community_rial_per_ton}
      />
    </PageFrame>
  );
}

const dualCardOperational: React.CSSProperties = {
  flex: "1 1 200px",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #86EFAC",
  background: "#F0FDF4",
};

const dualCardCommunity: React.CSSProperties = {
  flex: "1 1 200px",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #93C5FD",
  background: "#F3F1EB",
};

const th: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  fontWeight: 700,
};
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
