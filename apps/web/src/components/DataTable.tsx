import React from "react";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  sortKey?: string;
  width?: string | number;
  render: (row: T) => React.ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: { field: string; dir: "asc" | "desc" };
  onSort?: (field: string) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleRow?: (key: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  rowTitle?: (row: T) => string | undefined;
  emptyMessage?: string;
  testId?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  selectable,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  rowStyle,
  rowTitle,
  emptyMessage = "موردی یافت نشد.",
  testId,
}: DataTableProps<T>) {
  const allKeys = rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys?.has(k));

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        data-testid={testId}
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ background: "#F3F4F6", textAlign: "right" as const }}>
            {selectable && (
              <th style={thStyle}>
                <input
                  type="checkbox"
                  aria-label="انتخاب همه"
                  checked={allSelected}
                  onChange={(e) => onToggleAll?.(e.target.checked)}
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} style={{ ...thStyle, width: col.width }}>
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.sortKey ?? col.key)}
                    style={sortBtnStyle}
                    aria-label={`مرتب‌سازی ${col.key}`}
                  >
                    {col.header}
                    {sort?.field === (col.sortKey ?? col.key) ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ ...tdStyle, color: "#6B7280" }}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                data-testid={`${testId ?? "data-table"}-row-${key}`}
                style={rowStyle?.(row)}
                title={rowTitle?.(row)}
              >
                {selectable && (
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      aria-label={`انتخاب ${key}`}
                      checked={selectedKeys?.has(key) ?? false}
                      onChange={(e) => onToggleRow?.(key, e.target.checked)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={tdStyle}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  padding: "8px 10px",
  verticalAlign: "top",
};

const sortBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  color: "inherit",
};
