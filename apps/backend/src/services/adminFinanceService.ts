import type { FundType, MissionStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  financeDisplayLabels,
  PLATFORM_LEGAL_TERMS_FA,
  type FinanceDisplayLabels,
} from "../types/platformLegal";
import { fromDecimal } from "../repositories/decimal";
import { toBig, toNum } from "../repositories/id";
import * as walletsRepo from "../repositories/walletsRepository";
import { maskIban, normalizeIban, validateIranIbanChecksum } from "../lib/iban";
import * as ledgerRepo from "../repositories/financeLedgerRepository";
import type { FinanceByLoadRow } from "../repositories/financeLedgerRepository";

export type FinanceMonthTotals = {
  owner_share: number;
  community_pool: number;
  platform_share: number;
  verified_missions_count: number;
  /** Owner + platform wallet credits — operational settlement lane (OPERATIONAL + PLATFORM_REVENUE). */
  operational_total_rial: number;
  /** Sum of verified tons × community rate → Restricted Community Fund (not platform revenue). */
  community_pool_contributions_rial: number;
  /** PLATFORM-LEGAL-1 optional UI labels (fa + en). */
  display_labels?: FinanceDisplayLabels;
};

export type FinanceChartPoint = FinanceMonthTotals & {
  year: number;
  month: number;
  label: string;
};

export type FinanceIbanRow = {
  entity_type: "fleet_owner" | "household" | "cooperative";
  entity_id: number;
  name: string;
  iban_masked: string;
  iban_valid: boolean | null;
};

export type FinanceSummary = {
  period: { year: number; month: number; mine_id?: number };
  cards: FinanceMonthTotals;
  chart: FinanceChartPoint[];
  iban_rows: FinanceIbanRow[];
  /** PLATFORM-LEGAL-1 terms + section labels for admin finance UI. */
  display_labels: FinanceDisplayLabels;
  terms_fa: string;
};

/** Per VERIFIED mission — operational from wallet txs; community from mission snapshot. */
export type FinanceMissionRow = {
  mission_id: number;
  load_id: number;
  load_tracking_code: string;
  verified_at: string;
  operational_total_rial: number;
  owner_amount_rial: number;
  platform_amount_rial: number;
  community_contribution_rial: number;
  verified_net_tons: number;
  community_rate_rial_per_ton: number;
};

export type FinanceByLoadTotals = {
  operational_fare_rial: number;
  community_contribution_rial: number;
  note: string;
};

export type FinanceByLoadResult = {
  items: FinanceByLoadRow[];
  totals: FinanceByLoadTotals;
  period: { from: string; to: string; mine_id: number };
};

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return periodKey(year, month);
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function hourlyMineByLogId(): Promise<Map<number, number>> {
  const logs = await prisma.hourly_work_logs.findMany({
    select: { id: true, mine_id: true },
  });
  return new Map(logs.map((l) => [toNum(l.id), toNum(l.mine_id)]));
}

/** Signed flow for transactions tagged with fund_type (ACC-FUND-1 reporting). */
export async function sumByFundType(
  fundType: FundType,
  start: Date,
  end: Date,
  mineId?: number,
): Promise<number> {
  const hourlyMines = await hourlyMineByLogId();
  const txs = await prisma.transactions.findMany({
    where: {
      fund_type: fundType,
      created_at: { gte: start, lt: end },
    },
    include: {
      mission: { include: { load: true } },
    },
  });

  let sum = 0;
  for (const t of txs) {
    let txMine: number | undefined;
    if (t.mission?.load?.mine_id != null) {
      txMine = toNum(t.mission.load.mine_id);
    } else {
      const desc = t.description ?? "";
      const m = desc.match(/HOURLY_(?:CREDIT_)?(?:OWNER|PLATFORM|SPLIT:HOURLY_(?:OWNER|PLATFORM))#(\d+)/);
      if (m) txMine = hourlyMines.get(Number(m[1]));
      else {
        const hourly = desc.match(/OPERATIONAL_SPLIT:HOURLY_(?:OWNER|PLATFORM)#(\d+)/);
        if (hourly) txMine = hourlyMines.get(Number(hourly[1]));
      }
    }
    if (mineId != null && txMine !== mineId) continue;
    const amt = fromDecimal(t.amount);
    sum += walletsRepo.transactionBalanceDelta(t.type, amt);
  }
  return Math.round(sum * 100) / 100;
}

async function sumWalletFlow(
  walletType: "OWNER" | "PLATFORM",
  start: Date,
  end: Date,
  mineId?: number,
): Promise<number> {
  const hourlyMines = await hourlyMineByLogId();
  const txs = await prisma.transactions.findMany({
    where: {
      created_at: { gte: start, lt: end },
      wallet: { wallet_type: walletType },
    },
    include: {
      mission: { include: { load: true } },
    },
  });

  let sum = 0;
  for (const t of txs) {
    let txMine: number | undefined;
    if (t.mission?.load?.mine_id != null) {
      txMine = toNum(t.mission.load.mine_id);
    } else {
      const desc = t.description ?? "";
      const m = desc.match(/HOURLY_CREDIT_(?:OWNER|PLATFORM)#(\d+)/);
      if (m) txMine = hourlyMines.get(Number(m[1]));
    }
    if (mineId != null && txMine !== mineId) continue;
    const amt = fromDecimal(t.amount);
    sum += t.type === "CREDIT" ? amt : -amt;
  }
  return Math.round(sum * 100) / 100;
}

async function sumCommunityPool(year: number, month: number, mineId?: number): Promise<number> {
  const key = periodKey(year, month);
  const pools = await prisma.community_pools.findMany({
    where: {
      period_key: key,
      ...(mineId != null ? { mine_id: toBig(mineId) } : {}),
    },
  });
  const total = pools.reduce((s, p) => s + fromDecimal(p.total_amount), 0);
  return Math.round(total * 100) / 100;
}

async function countVerifiedMissions(start: Date, end: Date, mineId?: number): Promise<number> {
  return prisma.missions.count({
    where: {
      status: "VERIFIED",
      verified_at: { gte: start, lt: end },
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
  });
}

async function sumCommunityContributions(start: Date, end: Date, mineId?: number): Promise<number> {
  const rows = await prisma.missions.findMany({
    where: {
      verified_at: { gte: start, lt: end },
      community_contribution_rial: { not: null },
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
    select: { community_contribution_rial: true },
  });
  const total = rows.reduce((s, r) => s + fromDecimal(r.community_contribution_rial!), 0);
  return Math.round(total * 100) / 100;
}

async function monthTotals(year: number, month: number, mineId?: number): Promise<FinanceMonthTotals> {
  const { start, end } = monthBounds(year, month);
  const [owner_share, community_pool, platform_share, verified_missions_count, community_pool_contributions_rial] =
    await Promise.all([
      sumWalletFlow("OWNER", start, end, mineId),
      sumCommunityPool(year, month, mineId),
      sumWalletFlow("PLATFORM", start, end, mineId),
      countVerifiedMissions(start, end, mineId),
      sumCommunityContributions(start, end, mineId),
    ]);
  const operational_total_rial = Math.round((owner_share + platform_share) * 100) / 100;
  return {
    owner_share,
    community_pool,
    platform_share,
    verified_missions_count,
    operational_total_rial,
    community_pool_contributions_rial,
    display_labels: financeDisplayLabels(),
  };
}

export async function listIbanRows(mineId?: number): Promise<FinanceIbanRow[]> {
  const rows: FinanceIbanRow[] = [];

  const owners = await prisma.fleet_owners.findMany({
    where: mineId != null ? { cooperative: { mine_id: toBig(mineId) } } : {},
    select: { id: true, full_name: true, bank_iban: true },
    orderBy: { id: "asc" },
  });
  for (const o of owners) {
    const iban = o.bank_iban;
    rows.push({
      entity_type: "fleet_owner",
      entity_id: toNum(o.id),
      name: o.full_name,
      iban_masked: maskIban(iban),
      iban_valid: iban ? validateIranIbanChecksum(iban) : null,
    });
  }

  const households = await prisma.households.findMany({
    where: mineId != null ? { village: { mine_id: toBig(mineId) } } : {},
    select: { id: true, head_name: true, bank_iban: true },
    orderBy: { id: "asc" },
  });
  for (const h of households) {
    const iban = h.bank_iban;
    rows.push({
      entity_type: "household",
      entity_id: toNum(h.id),
      name: h.head_name,
      iban_masked: maskIban(iban),
      iban_valid: iban ? validateIranIbanChecksum(iban) : null,
    });
  }

  const coops = await prisma.cooperatives.findMany({
    where: mineId != null ? { mine_id: toBig(mineId) } : {},
    select: { id: true, name: true, iban: true },
    orderBy: { id: "asc" },
  });
  for (const c of coops) {
    const iban = c.iban;
    rows.push({
      entity_type: "cooperative",
      entity_id: toNum(c.id),
      name: c.name,
      iban_masked: maskIban(iban),
      iban_valid: iban ? validateIranIbanChecksum(iban) : null,
    });
  }

  return rows;
}

export async function listVerifiedMissionsForPeriod(
  year: number,
  month: number,
  mineId?: number,
): Promise<FinanceMissionRow[]> {
  const { start, end } = monthBounds(year, month);
  const missions = await prisma.missions.findMany({
    where: {
      status: "VERIFIED",
      verified_at: { gte: start, lt: end },
      ...(mineId != null ? { load: { mine_id: toBig(mineId) } } : {}),
    },
    include: {
      load: { select: { id: true, load_tracking_code: true } },
      transactions: { include: { wallet: { select: { wallet_type: true } } } },
    },
    orderBy: { verified_at: "desc" },
  });

  return missions.map((m) => {
    let owner_amount_rial = 0;
    let platform_amount_rial = 0;
    for (const t of m.transactions) {
      const amt = walletsRepo.transactionBalanceDelta(t.type, fromDecimal(t.amount));
      if (t.wallet.wallet_type === "OWNER") owner_amount_rial += amt;
      if (t.wallet.wallet_type === "PLATFORM") platform_amount_rial += amt;
    }
    owner_amount_rial = Math.round(owner_amount_rial * 100) / 100;
    platform_amount_rial = Math.round(platform_amount_rial * 100) / 100;
    const operational_total_rial = Math.round((owner_amount_rial + platform_amount_rial) * 100) / 100;
    const netKg = m.verified_net_tons_kg != null ? fromDecimal(m.verified_net_tons_kg) : 0;
    return {
      mission_id: toNum(m.id),
      load_id: toNum(m.load_id),
      load_tracking_code: m.load.load_tracking_code,
      verified_at: m.verified_at!.toISOString(),
      operational_total_rial,
      owner_amount_rial,
      platform_amount_rial,
      community_contribution_rial:
        m.community_contribution_rial != null
          ? Math.round(fromDecimal(m.community_contribution_rial) * 100) / 100
          : 0,
      verified_net_tons: Math.round((netKg / 1000) * 1000) / 1000,
      community_rate_rial_per_ton:
        m.community_rate_rial_per_ton != null
          ? Math.round(fromDecimal(m.community_rate_rial_per_ton) * 100) / 100
          : 0,
    };
  });
}

export async function listFinanceByLoad(
  from: Date,
  to: Date,
  mineId: number,
  status?: MissionStatus,
): Promise<FinanceByLoadResult> {
  const items = await ledgerRepo.listFinanceByLoadRows({ from, to, mineId, status });
  const operational_fare_rial = Math.round(
    items.reduce((s, r) => s + r.operational_fare_rial, 0) * 100,
  ) / 100;
  const community_contribution_rial = Math.round(
    items.reduce((s, r) => s + r.community_contribution_rial, 0) * 100,
  ) / 100;
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = new Date(to.getTime() - 1).toISOString().slice(0, 10);
  return {
    items,
    totals: {
      operational_fare_rial,
      community_contribution_rial,
      note: "community independent of fare",
    },
    period: { from: fromIso, to: toIso, mine_id: mineId },
  };
}

export async function getFinanceSummary(
  year: number,
  month: number,
  mineId?: number,
): Promise<FinanceSummary> {
  const cards = await monthTotals(year, month, mineId);
  const chart: FinanceChartPoint[] = [];
  for (let i = -2; i <= 0; i++) {
    const { year: y, month: m } = shiftMonth(year, month, i);
    const totals = await monthTotals(y, m, mineId);
    chart.push({
      year: y,
      month: m,
      label: monthLabel(y, m),
      ...totals,
    });
  }
  const iban_rows = await listIbanRows(mineId);
  const display_labels = financeDisplayLabels();
  return {
    period: { year, month, ...(mineId != null ? { mine_id: mineId } : {}) },
    cards,
    chart,
    iban_rows,
    display_labels,
    terms_fa: PLATFORM_LEGAL_TERMS_FA,
  };
}

export async function revealIban(
  entityType: "fleet_owner" | "household" | "cooperative",
  entityId: number,
): Promise<{ iban: string; entity_type: string; entity_id: number } | null> {
  if (entityType === "fleet_owner") {
    const row = await prisma.fleet_owners.findUnique({ where: { id: toBig(entityId) } });
    if (!row?.bank_iban) return null;
    return { iban: normalizeIban(row.bank_iban), entity_type: entityType, entity_id: entityId };
  }
  if (entityType === "household") {
    const row = await prisma.households.findUnique({ where: { id: toBig(entityId) } });
    if (!row?.bank_iban) return null;
    return { iban: normalizeIban(row.bank_iban), entity_type: entityType, entity_id: entityId };
  }
  const row = await prisma.cooperatives.findUnique({ where: { id: toBig(entityId) } });
  if (!row?.iban) return null;
  return { iban: normalizeIban(row.iban), entity_type: entityType, entity_id: entityId };
}

export function summaryToCsv(summary: FinanceSummary): string {
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push("بخش,مقدار");
  lines.push(["دوره", periodKey(summary.period.year, summary.period.month)].map(escape).join(","));
  const L = summary.display_labels;
  lines.push([L.operational_settlement.fa, summary.cards.operational_total_rial].map(escape).join(","));
  lines.push([L.owner_share.fa, summary.cards.owner_share].map(escape).join(","));
  lines.push([L.platform_service_fee.fa, summary.cards.platform_share].map(escape).join(","));
  lines.push([L.restricted_community_fund.fa + " (تن×نرخ)", summary.cards.community_pool_contributions_rial]
    .map(escape)
    .join(","));
  lines.push([L.restricted_community_fund.fa + " (موجودی دوره)", summary.cards.community_pool].map(escape).join(","));
  lines.push(["ماموریت VERIFIED", summary.cards.verified_missions_count].map(escape).join(","));
  lines.push("");
  lines.push(
    `ماه,${L.operational_settlement.fa},${L.restricted_community_fund.fa},${L.owner_share.fa},${L.platform_service_fee.fa},موجودی صندوق,VERIFIED`,
  );
  for (const p of summary.chart) {
    lines.push(
      [
        p.label,
        p.operational_total_rial,
        p.community_pool_contributions_rial,
        p.owner_share,
        p.platform_share,
        p.community_pool,
        p.verified_missions_count,
      ]
        .map(escape)
        .join(","),
    );
  }
  lines.push("");
  lines.push("نوع,شناسه,نام,IBAN ماسک,اعتبار چک‌سام");
  for (const r of summary.iban_rows) {
    lines.push(
      [r.entity_type, r.entity_id, r.name, r.iban_masked, r.iban_valid == null ? "" : String(r.iban_valid)]
        .map(escape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function summaryToPdfLines(summary: FinanceSummary): string[] {
  const pk = periodKey(summary.period.year, summary.period.month);
  const L = summary.display_labels;
  const lines = [
    `Finance Summary ${pk}`,
    `${L.operational_settlement.en}: ${summary.cards.operational_total_rial}`,
    `${L.restricted_community_fund.en} (tons×rate): ${summary.cards.community_pool_contributions_rial}`,
    `${L.owner_share.en}: ${summary.cards.owner_share}`,
    `${L.restricted_community_fund.en} balance: ${summary.cards.community_pool}`,
    `${L.platform_service_fee.en}: ${summary.cards.platform_share}`,
    `Verified missions: ${summary.cards.verified_missions_count}`,
    "--- Chart (3 months) ---",
  ];
  for (const p of summary.chart) {
    lines.push(
      `${p.label} | owner=${p.owner_share} restricted_fund=${p.community_pool} platform_fee=${p.platform_share} verified=${p.verified_missions_count}`,
    );
  }
  lines.push("--- IBAN (masked) ---");
  for (const r of summary.iban_rows.slice(0, 40)) {
    lines.push(`${r.entity_type}#${r.entity_id} ${r.name} ${r.iban_masked}`);
  }
  return lines;
}
