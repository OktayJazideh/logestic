import React, { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { formatJalaliDate } from "../lib/jalaliDate";
import { MineScope } from "../components/MineScope";
import { apiGetData, apiPostData, getStoredToken } from "../api";

type RateCardRow = {
  operation_type: string;
  material_type: string;
  unit_type: string;
  rate: number;
  effectiveFrom: string;
  status: string;
};

type VillageRow = { id: number; mine_id: number; name: string; district?: string };

type PreviewRow = {
  line: number;
  national_id: string;
  full_name: string;
  village_id?: number;
  village_code?: string;
  mobile?: string;
  valid: boolean;
  errors: string[];
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ line: number; code: string; message: string; national_id?: string }>;
  dry_run?: boolean;
  rows?: PreviewRow[];
};

type TabId = "base" | "bulk";

export default function CoopRequests() {
  const [tab, setTab] = useState<TabId>("base");
  const [rates, setRates] = useState<RateCardRow[] | null>(null);
  const [villages, setVillages] = useState<VillageRow[] | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);
  const [vilErr, setVilErr] = useState<string | null>(null);

  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewStats, setPreviewStats] = useState<{ valid: number; invalid: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function loadVillages() {
    if (!getStoredToken()) return;
    apiGetData<{ villages: VillageRow[] }>("/villages").then((r) => {
      if (r.ok) {
        setVillages(r.data.villages);
        setVilErr(null);
      } else {
        setVillages(null);
        setVilErr(r.message);
      }
    });
  }

  useEffect(() => {
    if (!getStoredToken()) return;
    apiGetData<{ rate_cards: RateCardRow[] }>("/rate-cards").then((r) => {
      if (r.ok) {
        setRates(r.data.rate_cards);
        setRateErr(null);
      } else {
        setRates(null);
        setRateErr(r.message);
      }
    });
    loadVillages();
  }, []);

  function onFileSelected(file: File | null) {
    setImportResult(null);
    setPreview(null);
    setPreviewStats(null);
    setBulkErr(null);
    if (!file) {
      setCsvText(null);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsvText(text);
    };
    reader.readAsText(file, "UTF-8");
  }

  async function runPreview() {
    if (!csvText?.trim()) {
      setBulkErr("فایل CSV انتخاب نشده.");
      return;
    }
    setBulkBusy(true);
    setBulkErr(null);
    setImportResult(null);
    const r = await apiPostData<ImportResult>(
      "/coop/households/import",
      { csv: csvText, dry_run: true },
      { skipIdempotency: true },
    );
    setBulkBusy(false);
    if (!r.ok) {
      setBulkErr(r.message);
      setPreview(null);
      return;
    }
    setPreview(r.data.rows ?? []);
    const valid = (r.data.rows ?? []).filter((row) => row.valid).length;
    const invalid = (r.data.rows ?? []).filter((row) => !row.valid).length;
    setPreviewStats({ valid, invalid });
  }

  async function confirmImport() {
    if (!csvText?.trim()) {
      setBulkErr("فایل CSV انتخاب نشده.");
      return;
    }
    if (!previewStats || previewStats.valid === 0) {
      setBulkErr("حداقل یک ردیف معتبر برای import لازم است.");
      return;
    }
    setBulkBusy(true);
    setBulkErr(null);
    const r = await apiPostData<ImportResult>(
      "/coop/households/import",
      { csv: csvText },
      { skipIdempotency: true },
    );
    setBulkBusy(false);
    if (!r.ok) {
      setBulkErr(r.message);
      return;
    }
    setImportResult(r.data);
    setPreview(null);
    setCsvText(null);
    setFileName(null);
  }

  return (
    <PageFrame
      title="درخواست‌ها و دادهٔ پایه — تعاونی"
      expectedRoles={["COOP_ADMIN", "COOP", "ADMIN"]}
      intro="نقش COOP: انتخاب معدن فعال، مشاهده روستاها و نرخ‌ها؛ ورود گروهی خانوار پایلوت (CSV) با وضعیت PENDING برای KYC."
    >
      <MineScope onMineSelected={() => loadVillages()} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" style={tab === "base" ? tabActive : tabBtn} onClick={() => setTab("base")}>
          دادهٔ پایه
        </button>
        <button type="button" style={tab === "bulk" ? tabActive : tabBtn} onClick={() => setTab("bulk")}>
          ورود گروهی
        </button>
      </div>

      {tab === "base" && (
        <>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "#111827" }}>نرخ‌های فعال</div>
            {rateErr && <div style={{ color: "#B45309", fontSize: 14 }}>{rateErr}</div>}
            {rates && rates.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>ماده</th>
                    <th style={th}>واحد</th>
                    <th style={th}>نرخ</th>
                    <th style={th}>از تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((row) => (
                    <tr key={`${row.material_type}-${row.effectiveFrom}`}>
                      <td style={td}>{row.material_type}</td>
                      <td style={td}>{row.unit_type}</td>
                      <td style={td}>{row.rate.toLocaleString("fa-IR")}</td>
                      <td style={td}>{formatJalaliDate(row.effectiveFrom)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rates && rates.length === 0 && <div style={{ color: "#6B7280" }}>نرخی ثبت نشده.</div>}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "#111827" }}>روستاهای معدن انتخاب‌شده</div>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>
              پس از «ثبت معدن فعال»، فهرست روستا از سشن خوانده می‌شود.
            </p>
            {vilErr && <div style={{ color: "#B45309", fontSize: 14 }}>{vilErr}</div>}
            {villages && villages.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>نام</th>
                    <th style={th}>ناحیه</th>
                    <th style={th}>شناسه</th>
                  </tr>
                </thead>
                <tbody>
                  {villages.map((v) => (
                    <tr key={v.id}>
                      <td style={td}>{v.name}</td>
                      <td style={td}>{v.district ?? "—"}</td>
                      <td style={td}>{v.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {villages && villages.length === 0 && (
              <div style={{ color: "#6B7280", fontSize: 14 }}>هنوز روستایی برای این معدن نیست یا معدن انتخاب نشده.</div>
            )}
          </div>
        </>
      )}

      {tab === "bulk" && (
        <div>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>
            ستون‌های CSV (سطر اول هدر):{" "}
            <code dir="ltr">national_id, full_name, village_code, mobile</code>
            — موبایل اختیاری؛ همه خانوارها با وضعیت <strong>PENDING</strong> ثبت می‌شوند.
          </p>

          <div style={{ marginBottom: 12 }}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            {fileName && (
              <span style={{ marginInlineStart: 10, fontSize: 13, color: "#374151" }}>{fileName}</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" style={primaryBtn} disabled={bulkBusy || !csvText} onClick={() => void runPreview()}>
              پیش‌نمایش
            </button>
            <button
              type="button"
              style={confirmBtn}
              disabled={bulkBusy || !preview || (previewStats?.valid ?? 0) === 0}
              onClick={() => void confirmImport()}
            >
              تأیید و import
            </button>
          </div>

          {bulkErr && <div style={{ color: "#B45309", fontSize: 14, marginBottom: 10 }}>{bulkErr}</div>}

          {previewStats && (
            <div style={{ fontSize: 13, marginBottom: 10, color: "#374151" }}>
              معتبر: {previewStats.valid.toLocaleString("fa-IR")} — نامعتبر:{" "}
              {previewStats.invalid.toLocaleString("fa-IR")}
            </div>
          )}

          {preview && preview.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
                    <th style={th}>ردیف</th>
                    <th style={th}>کد ملی</th>
                    <th style={th}>نام</th>
                    <th style={th}>روستا</th>
                    <th style={th}>موبایل</th>
                    <th style={th}>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.line} style={{ background: row.valid ? "#fff" : "#FEF2F2" }}>
                      <td style={td}>{row.line}</td>
                      <td style={td} dir="ltr">
                        {row.national_id}
                      </td>
                      <td style={td}>{row.full_name}</td>
                      <td style={td}>{row.village_id ?? row.village_code ?? "—"}</td>
                      <td style={td} dir="ltr">
                        {row.mobile ?? "—"}
                      </td>
                      <td style={td}>
                        {row.valid ? (
                          <span style={{ color: "#059669" }}>OK</span>
                        ) : (
                          <span style={{ color: "#B91C1C" }}>{row.errors.join("؛ ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importResult && (
            <div
              style={{
                background: "#ECFDF5",
                border: "1px solid #A7F3D0",
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
              }}
            >
              <div>
                <strong>نتیجه import:</strong> {importResult.imported.toLocaleString("fa-IR")} ثبت،{" "}
                {importResult.skipped.toLocaleString("fa-IR")} رد/ردیف خطا
              </div>
              {importResult.errors.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingInlineStart: 20, fontSize: 13 }}>
                  {importResult.errors.slice(0, 12).map((e, i) => (
                    <li key={`${e.line}-${i}`}>
                      ردیف {e.line}: {e.message}
                    </li>
                  ))}
                  {importResult.errors.length > 12 && <li>… و {importResult.errors.length - 12} مورد دیگر</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </PageFrame>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  fontWeight: 700,
};
const td: React.CSSProperties = { border: "1px solid #E5E7EB", padding: "8px 10px" };
const tabBtn: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#fff",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};
const tabActive: React.CSSProperties = { ...tabBtn, background: "#ECFDF5", borderColor: "#059669", fontWeight: 700 };
const primaryBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#1B5E20",
  color: "#fff",
  borderColor: "#1B5E20",
};
const confirmBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#0F3D17",
  color: "#fff",
  borderColor: "#0F3D17",
};
