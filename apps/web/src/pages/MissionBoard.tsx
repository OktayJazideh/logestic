import React, { useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageFrame } from "../components/PageFrame";
import { formatJalaliDate } from "../lib/jalaliDate";
import { labelFa, MATERIAL_TYPE_FA, OPERATION_TYPE_FA, RATE_CARD_STATUS_FA } from "../lib/uiLabels";
import { apiGetData, getStoredToken } from "../api";

type RateCardRow = {
  operation_type: string;
  material_type: string;
  unit_type: string;
  rate: number;
  effectiveFrom: string;
  status: string;
};

export default function MissionBoard() {
  const [rows, setRows] = useState<RateCardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setErr("توکن تنظیم نشده.");
      return;
    }
    apiGetData<{ rate_cards: RateCardRow[] }>("/rate-cards").then((r) => {
      if (r.ok) {
        setRows(r.data.rate_cards);
        setErr(null);
      } else {
        setRows(null);
        setErr(r.message);
      }
    });
  }, []);

  const columns = useMemo<DataTableColumn<RateCardRow>[]>(
    () => [
      {
        key: "operation",
        header: "نوع عملیات",
        render: (row) => labelFa(OPERATION_TYPE_FA, row.operation_type),
      },
      {
        key: "material",
        header: "ماده",
        render: (row) => labelFa(MATERIAL_TYPE_FA, row.material_type),
      },
      {
        key: "unit",
        header: "واحد",
        render: (row) =>
          row.unit_type === "TON" ? "تن" : row.unit_type === "HOUR" ? "ساعت" : row.unit_type,
      },
      {
        key: "rate",
        header: "نرخ",
        render: (row) => row.rate.toLocaleString("fa-IR"),
      },
      {
        key: "effective",
        header: "موثر از",
        render: (row) => formatJalaliDate(row.effectiveFrom),
      },
      {
        key: "status",
        header: "وضعیت",
        render: (row) => labelFa(RATE_CARD_STATUS_FA, row.status),
      },
    ],
    [],
  );

  return (
    <PageFrame
      title="بورد ماموریت / نرخ"
      expectedRoles={[
        "ADMIN",
        "OPERATION_ADMIN",
        "COOP_ADMIN",
        "COOP_OPERATOR",
        "COOP",
        "EMPLOYER",
        "CONSULTANT",
        "HOUSEHOLD",
      ]}
      intro="جدول نرخ‌های فعال برای عملیات حمل تنی. لیست سراسری ماموریت‌ها در صورت افزوده شدن endpoint مدیریتی به همین جدول الصاق می‌شود."
    >
      {err && (
        <div style={{ color: "#B45309", marginBottom: 12, fontSize: 14 }}>
          {err}
        </div>
      )}
      {rows && rows.length > 0 && (
        <DataTable
          testId="mission-board-table"
          rows={rows}
          rowKey={(row) => `${row.material_type}-${row.effectiveFrom}`}
          columns={columns}
          emptyMessage="نرخی برای نمایش نیست."
        />
      )}
      {rows && rows.length === 0 && !err && (
        <div style={{ color: "#6B7280" }}>نرخی برای نمایش نیست.</div>
      )}
    </PageFrame>
  );
}
