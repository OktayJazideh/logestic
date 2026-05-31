import type { Household, FleetOwner } from "./entitiesStore";
import * as rateCardsRepo from "../repositories/rateCardsRepository";
import type { RateCardMvp, RateCardOperationType } from "../repositories/rateCardsRepository";
import * as walletsRepo from "../repositories/walletsRepository";
import * as communityPoolsRepo from "../repositories/communityPoolsRepository";
import * as ledgerRepo from "../repositories/financeLedgerRepository";
import { prisma } from "../db/prisma";
import { ruleEngine } from "../services/ruleEngine";
import { resolveTonnageFare } from "../services/serviceContractFareService";

export type WalletType = "OWNER" | "HOUSEHOLD" | "PLATFORM";

export type Wallet = {
  id: number;
  wallet_type: WalletType;
  owner_user_id?: number;
  owner_id?: number;
  household_user_id?: number;
  household_id?: number;
  active: boolean;
};

export type Transaction = walletsRepo.TransactionRow;

export type RateCard = RateCardMvp;

export type CommunityPoolStatus = "OPEN" | "SNAPSHOT_LOCKED" | "DISTRIBUTED";

export type CommunityPoolPeriod = communityPoolsRepo.CommunityPoolRow;

export class FinanceStore {
  private rateCards: RateCard[] = [];

  async hydrateRateCards() {
    this.rateCards = await rateCardsRepo.listActiveRateCards();
  }

  listRateCards() {
    return this.rateCards.slice();
  }

  async resolveActiveRate(
    mine_id: number,
    operation_type: RateCardOperationType,
    material_type: string,
    at = new Date(),
  ) {
    return rateCardsRepo.getActiveRateCard(mine_id, operation_type, material_type, at);
  }

  async getHourlyRate(mine_id: number, at = new Date()) {
    const card = await rateCardsRepo.getActiveHourlyRateCard(mine_id, at);
    if (!card) return null;
    return { rate: card.rate, material_type: card.material_type, rate_card_id: card.id };
  }

  async computeFareTonnage(
    quantity_tons: number,
    material_type: string,
    mine_id = 1,
    cooperative_id?: number,
    at = new Date(),
  ) {
    const fare = await resolveTonnageFare({
      mine_id,
      cooperative_id,
      material_type,
      quantity_tons,
      at,
    });
    return {
      totalFare: fare.totalFare,
      rate: fare.rate,
      rate_card_id: fare.rate_card_id,
    };
  }

  private periodKey(at = new Date(), mine_id?: number, cooperative_id?: number) {
    return ruleEngine.getPeriodKey(at, { mineId: mine_id, cooperativeId: cooperative_id });
  }

  async creditMissionShares(
    params: {
      mission_id: number;
      mine_id: number;
      owner: FleetOwner;
      household: Household;
      material_type: string;
      quantity_tons: number;
      verified_net_tons_kg: number;
      at?: Date;
    },
    tx?: import("@prisma/client").Prisma.TransactionClient,
  ) {
    const fare = await this.computeFareTonnage(
      params.quantity_tons,
      params.material_type,
      params.mine_id,
      params.household.cooperative_id,
      params.at,
    );
    const period_key = await this.periodKey(params.at, params.mine_id, params.household.cooperative_id);
    const splitParams = {
      mission_id: params.mission_id,
      mine_id: params.mine_id,
      period_key,
      totalFare: fare.totalFare,
      verified_net_tons_kg: params.verified_net_tons_kg,
      owner_id: params.owner.id,
      household_id: params.household.id,
      owner_active: params.owner.status === "APPROVED",
      household_active: params.household.status === "APPROVED",
      at: params.at,
      cooperative_id: params.household.cooperative_id,
    };
    const ledger = tx
      ? await ledgerRepo.applyMissionSplitInTx(tx, splitParams)
      : await ledgerRepo.runMissionSplitTransaction(splitParams);
    return { ...ledger, rate: fare.rate, rate_card_id: fare.rate_card_id, totalFare: fare.totalFare };
  }

  async creditHourlyShares(
    params: {
      mission_id?: number;
      mine_id: number;
      hourly_log_id: number;
      owner: FleetOwner;
      household: Household;
      hours: number;
      hourly_rate?: number;
      at?: Date;
    },
    tx?: import("@prisma/client").Prisma.TransactionClient,
  ) {
    let hourlyRate = params.hourly_rate;
    let rateCardId: number | undefined;
    if (hourlyRate == null) {
      const card = await rateCardsRepo.getActiveHourlyRateCard(params.mine_id, params.at ?? new Date());
      if (!card) throw new Error("no_valid_rate_card");
      hourlyRate = card.rate;
      rateCardId = card.id;
    }
    const totalFare = params.hours * hourlyRate;
    const period_key = await this.periodKey(params.at, params.mine_id, params.household.cooperative_id);
    const splitParams = {
      mission_id: params.mission_id,
      mine_id: params.mine_id,
      hourly_work_log_id: params.hourly_log_id,
      period_key,
      totalFare,
      owner_id: params.owner.id,
      owner_active: params.owner.status === "APPROVED",
      at: params.at,
      cooperative_id: params.household.cooperative_id,
    };
    const ledger = tx
      ? await ledgerRepo.applyHourlySplitInTx(tx, splitParams)
      : await prisma.$transaction((inner) => ledgerRepo.applyHourlySplitInTx(inner, splitParams));
    return { ...ledger, rate: hourlyRate, rate_card_id: rateCardId, totalFare };
  }

  async applyTonnageFareDelta(params: {
    mission_id: number;
    mine_id: number;
    owner: FleetOwner;
    household: Household;
    delta_total_fare: number;
    delta_verified_net_kg?: number;
  }) {
    const period_key = await this.periodKey(undefined, params.mine_id, params.household.cooperative_id);
    return prisma.$transaction((tx) =>
      ledgerRepo.applyFareDeltaInTx(tx, {
        mission_id: params.mission_id,
        mine_id: params.mine_id,
        period_key,
        delta_total_fare: params.delta_total_fare,
        delta_verified_net_kg: params.delta_verified_net_kg,
        owner_id: params.owner.id,
        household_id: params.household.id,
        owner_active: params.owner.status === "APPROVED",
        household_active: params.household.status === "APPROVED",
        cooperative_id: params.household.cooperative_id,
      }),
    );
  }

  listCommunityPools() {
    return communityPoolsRepo.listCommunityPools();
  }

  lockCommunityPoolSnapshot(params: { period_key: string; mine_id: number; household_ids: number[] }) {
    return communityPoolsRepo.lockPoolSnapshot(params.period_key, params.mine_id, params.household_ids);
  }

  distributeCommunityPool(poolId: number, at?: Date) {
    return communityPoolsRepo.distributePool(poolId, at);
  }

  /** SET-1 monthly-close: snapshot APPROVED households at month-end, then distribute pool. */
  async monthlyClosePool(params: { mine_id: number; year: number; month: number }) {
    const monthEnd = new Date(Date.UTC(params.year, params.month, 0, 23, 59, 59, 999));
    const period_key = await this.periodKey(monthEnd, params.mine_id);
    const pool = await communityPoolsRepo.findPoolByMinePeriod(params.mine_id, period_key);
    if (!pool) return { ok: false as const, reason: "pool_not_found" };
    return communityPoolsRepo.distributePool(pool.id, monthEnd);
  }

  getTransactionsForWallet(walletId: number, params?: { mine_id?: number }) {
    return walletsRepo.getTransactionsForWallet(walletId, params);
  }

  async findWalletForOwner(ownerId: number, ownerUserId?: number, active = true): Promise<Wallet | null> {
    const w = await walletsRepo.findWalletForOwner(ownerId);
    if (!w) return null;
    return {
      id: w.id,
      wallet_type: w.wallet_type as WalletType,
      owner_id: w.owner_id,
      owner_user_id: ownerUserId,
      active,
    };
  }

  async findWalletForHousehold(householdId: number, householdUserId?: number, active = true): Promise<Wallet | null> {
    const w = await walletsRepo.findWalletForHousehold(householdId);
    if (!w) return null;
    return {
      id: w.id,
      wallet_type: w.wallet_type as WalletType,
      household_id: w.household_id,
      household_user_id: householdUserId,
      active,
    };
  }

  getWalletBalance(walletId: number, params?: { mine_id?: number }) {
    return walletsRepo.getWalletBalance(walletId, params);
  }
}
