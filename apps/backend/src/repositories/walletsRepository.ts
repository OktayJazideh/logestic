import type { FundType, LedgerLane, Prisma, TransactionType, WalletType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";
import { fromDecimal, toDecimal } from "./decimal";

export type WalletRow = {
  id: number;
  wallet_type: WalletType;
  owner_id?: number;
  household_id?: number;
};

export type TransactionRow = {
  id: number;
  wallet_id: number;
  mission_id?: number;
  amount: number;
  type: TransactionType;
  fund_type?: FundType;
  ledger_lane?: LedgerLane;
  description?: string;
  created_at: Date;
};

type Tx = Prisma.TransactionClient;

function mapWallet(r: {
  id: bigint;
  wallet_type: WalletType;
  owner_id: bigint | null;
  household_id: bigint | null;
}): WalletRow {
  return {
    id: toNum(r.id),
    wallet_type: r.wallet_type,
    owner_id: r.owner_id != null ? toNum(r.owner_id) : undefined,
    household_id: r.household_id != null ? toNum(r.household_id) : undefined,
  };
}

function mapTx(r: {
  id: bigint;
  wallet_id: bigint;
  mission_id: bigint | null;
  amount: { toString(): string };
  type: TransactionType;
  fund_type: FundType | null;
  ledger_lane: LedgerLane | null;
  description: string | null;
  created_at: Date;
}): TransactionRow {
  return {
    id: toNum(r.id),
    wallet_id: toNum(r.wallet_id),
    mission_id: r.mission_id != null ? toNum(r.mission_id) : undefined,
    amount: fromDecimal(r.amount),
    type: r.type,
    fund_type: r.fund_type ?? undefined,
    ledger_lane: r.ledger_lane ?? undefined,
    description: r.description ?? undefined,
    created_at: r.created_at,
  };
}

export async function findWalletForOwner(ownerId: number): Promise<WalletRow | null> {
  const r = await prisma.wallets.findFirst({
    where: { wallet_type: "OWNER", owner_id: toBig(ownerId) },
  });
  return r ? mapWallet(r) : null;
}

export async function findWalletForHousehold(householdId: number): Promise<WalletRow | null> {
  const r = await prisma.wallets.findFirst({
    where: { wallet_type: "HOUSEHOLD", household_id: toBig(householdId) },
  });
  return r ? mapWallet(r) : null;
}

export async function findOrCreateOwnerWallet(ownerId: number, tx: Tx): Promise<WalletRow> {
  const existing = await tx.wallets.findFirst({
    where: { wallet_type: "OWNER", owner_id: toBig(ownerId) },
  });
  if (existing) return mapWallet(existing);
  const r = await tx.wallets.create({
    data: { wallet_type: "OWNER", owner_id: toBig(ownerId) },
  });
  return mapWallet(r);
}

export async function findOrCreateHouseholdWallet(householdId: number, tx: Tx): Promise<WalletRow> {
  const existing = await tx.wallets.findFirst({
    where: { wallet_type: "HOUSEHOLD", household_id: toBig(householdId) },
  });
  if (existing) return mapWallet(existing);
  const r = await tx.wallets.create({
    data: { wallet_type: "HOUSEHOLD", household_id: toBig(householdId) },
  });
  return mapWallet(r);
}

export async function findOrCreatePlatformWallet(tx: Tx): Promise<WalletRow> {
  const existing = await tx.wallets.findFirst({
    where: { wallet_type: "PLATFORM", platform_owner_key: "DEFAULT" },
  });
  if (existing) return mapWallet(existing);
  const r = await tx.wallets.create({
    data: { wallet_type: "PLATFORM", platform_owner_key: "DEFAULT" },
  });
  return mapWallet(r);
}

export async function createTransaction(
  params: {
    wallet_id: number;
    mission_id?: number;
    community_pool_id?: number;
    amount: number;
    type: TransactionType;
    fund_type?: FundType;
    ledger_lane?: LedgerLane;
    description?: string;
  },
  tx: Tx,
): Promise<TransactionRow> {
  const r = await tx.transactions.create({
    data: {
      wallet_id: toBig(params.wallet_id),
      mission_id: params.mission_id != null ? toBig(params.mission_id) : null,
      community_pool_id: params.community_pool_id != null ? toBig(params.community_pool_id) : null,
      amount: toDecimal(Math.abs(params.amount)),
      type: params.type,
      fund_type: params.fund_type,
      ledger_lane: params.ledger_lane,
      description: params.description,
    },
  });
  return mapTx(r);
}

function transactionMatchesMine(
  row: {
    mission_id: bigint | null;
    community_pool_id: bigint | null;
    mission: { load: { mine_id: bigint } } | null;
    community_pool: { mine_id: bigint | null } | null;
  },
  mineBig: bigint,
): boolean {
  if (row.mission_id != null) {
    return row.mission?.load.mine_id === mineBig;
  }
  if (row.community_pool_id != null) {
    return row.community_pool?.mine_id === mineBig;
  }
  return false;
}

export async function getTransactionsForWallet(
  walletId: number,
  params?: { mine_id?: number },
): Promise<TransactionRow[]> {
  if (params?.mine_id == null) {
    const rows = await prisma.transactions.findMany({
      where: { wallet_id: toBig(walletId) },
      orderBy: { created_at: "desc" },
    });
    return rows.map(mapTx);
  }

  const mineBig = toBig(params.mine_id);
  const rows = await prisma.transactions.findMany({
    where: { wallet_id: toBig(walletId) },
    include: {
      mission: { select: { load: { select: { mine_id: true } } } },
      community_pool: { select: { mine_id: true } },
    },
    orderBy: { created_at: "desc" },
  });
  return rows.filter((r) => transactionMatchesMine(r, mineBig)).map((r) => mapTx(r));
}

/** Signed balance delta for a single transaction (CREDIT + POOL_DISTRIBUTION increase balance). */
export function transactionBalanceDelta(type: TransactionType, amount: number): number {
  if (type === "CREDIT" || type === "POOL_DISTRIBUTION") return amount;
  return -amount;
}

export async function computeWalletLedgerSum(walletId: number, params?: { mine_id?: number }): Promise<number> {
  const txs = await getTransactionsForWallet(walletId, params);
  return txs.reduce((sum, t) => sum + transactionBalanceDelta(t.type, t.amount), 0);
}

export async function getWalletBalance(walletId: number, params?: { mine_id?: number }): Promise<number> {
  return computeWalletLedgerSum(walletId, params);
}
