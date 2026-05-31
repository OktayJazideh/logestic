import React from "react";

type DiffLine = { kind: "same" | "add" | "remove"; text: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || obj === undefined) {
    if (prefix) out[prefix] = String(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    out[prefix || "(root)"] = JSON.stringify(obj, null, 2);
    return out;
  }
  if (!isPlainObject(obj)) {
    out[prefix || "(root)"] = JSON.stringify(obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) || Array.isArray(v)) {
      Object.assign(out, flatten(v, path));
    } else {
      out[path] = JSON.stringify(v);
    }
  }
  return out;
}

function buildDiff(before: unknown, after: unknown): DiffLine[] {
  const b = flatten(before ?? {});
  const a = flatten(after ?? {});
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const lines: DiffLine[] = [];
  for (const key of [...keys].sort()) {
    const bv = b[key];
    const av = a[key];
    if (bv === av) {
      if (bv !== undefined) lines.push({ kind: "same", text: `${key}: ${bv}` });
    } else if (bv === undefined) {
      lines.push({ kind: "add", text: `+ ${key}: ${av}` });
    } else if (av === undefined) {
      lines.push({ kind: "remove", text: `- ${key}: ${bv}` });
    } else {
      lines.push({ kind: "remove", text: `- ${key}: ${bv}` });
      lines.push({ kind: "add", text: `+ ${key}: ${av}` });
    }
  }
  return lines;
}

const color: Record<DiffLine["kind"], { bg: string; fg: string }> = {
  same: { bg: "#F9FAFB", fg: "#374151" },
  add: { bg: "#ECFDF5", fg: "#065F46" },
  remove: { bg: "#FEF2F2", fg: "#991B1B" },
};

type Props = {
  before: unknown;
  after: unknown;
};

export function JsonDiffView({ before, after }: Props) {
  const lines = buildDiff(before, after);
  if (lines.length === 0) {
    return <div style={{ fontSize: 12, color: "#6B7280" }}>بدون تغییر</div>;
  }
  return (
    <pre
      style={{
        margin: 0,
        padding: 8,
        borderRadius: 8,
        border: "1px solid #E5E7EB",
        fontSize: 11,
        lineHeight: 1.6,
        overflow: "auto",
        maxHeight: 280,
        direction: "ltr",
        textAlign: "left",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={`${line.kind}-${i}`}
          style={{
            background: color[line.kind].bg,
            color: color[line.kind].fg,
            padding: "1px 4px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {line.text}
        </div>
      ))}
    </pre>
  );
}
