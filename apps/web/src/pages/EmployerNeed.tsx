import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { MineScope } from "../components/MineScope";
import { apiGetData, getStoredToken } from "../api";

type VillageRow = { id: number; mine_id: number; name: string; district?: string };

export default function EmployerNeed() {
  const [villages, setVillages] = useState<VillageRow[]>([]);
  const [villageId, setVillageId] = useState<number | "">("");
  const [tons, setTons] = useState("");
  const [note, setNote] = useState("");
  const [vilErr, setVilErr] = useState<string | null>(null);

  function loadVillages() {
    if (!getStoredToken()) return;
    apiGetData<{ villages: VillageRow[] }>("/villages").then((r) => {
      if (r.ok) {
        setVillages(r.data.villages);
        setVilErr(null);
      } else {
        setVillages([]);
        setVilErr(r.message);
      }
    });
  }

  useEffect(() => {
    loadVillages();
  }, []);

  return (
    <PageFrame
      title="ثبت نیاز حمل — کارفرما"
      expectedRoles={["EMPLOYER", "ADMIN"]}
      intro="نقش EMPLOYER: تعیین معدن فعال، انتخاب روستای مقصد و ثبت نتیجه در دفترچه عملیاتی. اتصال کامل به API تخصیص ماموریت در بک‌اند در نوبت بعد."
    >
      <MineScope onMineSelected={() => loadVillages()} />

      {vilErr && (
        <div style={{ color: "#B45309", marginBottom: 12, fontSize: 14 }}>{vilErr}</div>
      )}

      <form
        style={{
          maxWidth: 480,
          padding: 16,
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          background: "#FAFAFA",
        }}
        onSubmit={(e) => {
          e.preventDefault();
          window.alert(
            "ثبت نیاز در API نهایی (`employer/needs` یا معادل) هنوز در بک‌اند وصل نشده است. فیلدها فقط برای نمونه‌ی UI هستند.",
          );
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>روستای مقصد</label>
          <select
            value={villageId === "" ? "" : String(villageId)}
            onChange={(e) => setVillageId(e.target.value ? Number(e.target.value) : "")}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}
          >
            <option value="">— ابتدا معدن را ثبت کنید —</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.district ? ` — ${v.district}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            حجم تخمینی (تن)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={tons}
            onChange={(e) => setTons(e.target.value)}
            placeholder="مثال: ۲۴"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>یادداشت</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", resize: "vertical" as const }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#1B5E20",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ثبت نیاز (نمونه UI)
        </button>
      </form>
    </PageFrame>
  );
}
