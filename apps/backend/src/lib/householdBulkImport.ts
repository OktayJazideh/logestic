import type { HouseholdStatus } from "@prisma/client";
import { env } from "../config/env";
import { normalizeNationalId, validateIranNationalIdChecksum } from "./nationalId";
import { isPersianName, normalizePersianText } from "./persianText";

export type BulkImportCsvRow = {
  national_id: string;
  full_name: string;
  village_id?: number;
  village_code?: string;
  mobile?: string;
};

export type BulkImportParsedRow = BulkImportCsvRow & { line: number };

export type BulkImportRowError = {
  line: number;
  national_id?: string;
  code: string;
  message: string;
};

export type BulkImportPreviewRow = {
  line: number;
  national_id: string;
  full_name: string;
  village_id?: number;
  village_code?: string;
  mobile?: string;
  valid: boolean;
  errors: string[];
};

export type BulkImportResult = {
  imported: number;
  skipped: number;
  errors: BulkImportRowError[];
  dry_run: boolean;
  rows?: BulkImportPreviewRow[];
};

const REQUIRED_HEADERS = ["national_id", "full_name"] as const;
const VILLAGE_HEADERS = ["village_id", "village_code"] as const;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Minimal RFC4180-style CSV line parser (quoted fields supported). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseHouseholdImportCsv(csvText: string): {
  rows: BulkImportParsedRow[];
  errors: BulkImportRowError[];
} {
  const errors: BulkImportRowError[] = [];
  const raw = csvText.replace(/^\uFEFF/, "").trim();
  if (!raw) {
    return { rows: [], errors: [{ line: 0, code: "empty_csv", message: "CSV is empty" }] };
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, code: "missing_data", message: "CSV must include header and at least one row" }],
    };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const headerSet = new Set(headerCells);

  for (const req of REQUIRED_HEADERS) {
    if (!headerSet.has(req)) {
      return {
        rows: [],
        errors: [{ line: 1, code: "invalid_header", message: `Missing required column: ${req}` }],
      };
    }
  }
  if (!VILLAGE_HEADERS.some((h) => headerSet.has(h))) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          code: "invalid_header",
          message: "Missing village column: village_id or village_code required",
        },
      ],
    };
  }

  const idx = (name: string) => headerCells.indexOf(name);
  const nationalIdx = idx("national_id");
  const nameIdx = idx("full_name");
  const villageIdIdx = headerSet.has("village_id") ? idx("village_id") : -1;
  const villageCodeIdx = headerSet.has("village_code") ? idx("village_code") : -1;
  const mobileIdx = headerSet.has("mobile")
    ? idx("mobile")
    : headerSet.has("mobile_optional")
      ? idx("mobile_optional")
      : -1;

  const rows: BulkImportParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = parseCsvLine(lines[i]);
    const national_id = (cells[nationalIdx] ?? "").trim();
    const full_name = (cells[nameIdx] ?? "").trim();
    const village_id_raw = villageIdIdx >= 0 ? (cells[villageIdIdx] ?? "").trim() : "";
    const village_code_raw = villageCodeIdx >= 0 ? (cells[villageCodeIdx] ?? "").trim() : "";
    const mobile_raw = mobileIdx >= 0 ? (cells[mobileIdx] ?? "").trim() : "";

    const row: BulkImportParsedRow = {
      line: lineNo,
      national_id,
      full_name,
      ...(village_id_raw ? { village_id: Number(village_id_raw) } : {}),
      ...(village_code_raw ? { village_code: village_code_raw } : {}),
      ...(mobile_raw ? { mobile: mobile_raw } : {}),
    };
    rows.push(row);
  }

  return { rows, errors };
}

export function normalizeIranMobile(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return digits;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  if (digits.length === 12 && digits.startsWith("98")) return `0${digits.slice(2)}`;
  return undefined;
}

export function placeholderMobileForNationalId(nationalId: string, cooperativeId: number): string {
  const digits = normalizeNationalId(nationalId);
  const tail = digits.slice(-7).padStart(7, "0");
  const coopTail = String(cooperativeId % 100).padStart(2, "0");
  return `09imp${coopTail}${tail}`.slice(0, 11);
}

export function defaultImportStatus(): HouseholdStatus {
  return env.IMPORT_AUTO_APPROVE ? "APPROVED" : "PENDING";
}

export function validateParsedRow(
  row: BulkImportParsedRow,
  opts: {
    seenNationalIds: Set<string>;
    resolveVillage: (row: BulkImportParsedRow) => { village_id?: number; error?: string };
  },
): { ok: true; village_id: number; national_id: string; mobile?: string } | { ok: false; errors: BulkImportRowError[] } {
  const errors: BulkImportRowError[] = [];
  const national_id = normalizeNationalId(row.national_id);

  if (!national_id) {
    errors.push({
      line: row.line,
      code: "missing_national_id",
      message: "national_id is required",
    });
  } else if (!validateIranNationalIdChecksum(national_id)) {
    errors.push({
      line: row.line,
      national_id,
      code: "invalid_national_id_checksum",
      message: "Invalid Iranian national_id checksum",
    });
  } else if (opts.seenNationalIds.has(national_id)) {
    errors.push({
      line: row.line,
      national_id,
      code: "duplicate_national_id_in_file",
      message: "Duplicate national_id in CSV",
    });
  } else {
    opts.seenNationalIds.add(national_id);
  }

  const fullNameNorm = row.full_name ? normalizePersianText(row.full_name) : "";
  if (!fullNameNorm || !isPersianName(fullNameNorm)) {
    errors.push({
      line: row.line,
      national_id: national_id || undefined,
      code: "invalid_full_name",
      message: "full_name must be Persian (at least 2 characters)",
    });
  }

  const villageResolved = opts.resolveVillage(row);
  if (villageResolved.error || villageResolved.village_id == null) {
    errors.push({
      line: row.line,
      national_id: national_id || undefined,
      code: "invalid_village",
      message: villageResolved.error ?? "village not found",
    });
  }

  let mobile: string | undefined;
  if (row.mobile) {
    mobile = normalizeIranMobile(row.mobile);
    if (!mobile) {
      errors.push({
        line: row.line,
        national_id: national_id || undefined,
        code: "invalid_mobile",
        message: "mobile must be a valid Iranian mobile (09xxxxxxxxx)",
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, village_id: villageResolved.village_id!, national_id, mobile };
}

export function toPreviewRows(
  parsed: BulkImportParsedRow[],
  opts: {
    resolveVillage: (row: BulkImportParsedRow) => { village_id?: number; error?: string };
  },
): BulkImportPreviewRow[] {
  const seen = new Set<string>();
  return parsed.map((row) => {
    const result = validateParsedRow(row, { seenNationalIds: seen, resolveVillage: opts.resolveVillage });
    if (result.ok) {
      return {
        line: row.line,
        national_id: result.national_id,
        full_name: row.full_name,
        village_id: result.village_id,
        village_code: row.village_code,
        mobile: result.mobile,
        valid: true,
        errors: [],
      };
    }
    return {
      line: row.line,
      national_id: normalizeNationalId(row.national_id) || row.national_id,
      full_name: row.full_name,
      village_id: row.village_id,
      village_code: row.village_code,
      mobile: row.mobile,
      valid: false,
      errors: result.errors.map((e) => e.message),
    };
  });
}
