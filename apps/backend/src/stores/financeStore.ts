import type { Household, FleetOwner } from "./entitiesStore";

export type WalletType = "OWNER" | "HOUSEHOLD" | "PLATFORM";

export type Wallet = {
  id: number;
  wallet_type: WalletType;
  owner_user_id?: number;
  owner_id?: number; // fleet_owner.id
  household_user_id?: number;
  household_id?: number; // household.id
  active: boolean;
};

export type Transaction = {
  id: number;
  wallet_id: number;
  mission_id?: number;
  amount: number;
  type: "CREDIT" | "DEBIT";
  description?: string;
  created_at: Date;
};

export type HouseholdShare = {
  id: number;
  household_id: number;
  mission_id: number;
  amount: number;
  created_at: Date;
};

export type RateCard = {
  operation_type: "HAULING_TONNAGE";
  material_type: string;
  unit_type: "TON";
  rate: number; // per ton
  effectiveFrom: string; // ISO date
  status: "ACTIVE";
};

export class FinanceStore {
  private wallets: Wallet[] = [];
  private transactions: Transaction[] = [];
  private shares: HouseholdShare[] = [];

  private idSeq = 1;

  // MVP fixed rate card seed (can be replaced with DB seed later)
  private rateCards: RateCard[] = [
    {
      operation_type: "HAULING_TONNAGE",
      material_type: "ORE",
      unit_type: "TON",
      rate: 12000,
      effectiveFrom: "2026-01-01",
      status: "ACTIVE",
    },
  ];

  getRateCard(operation_type: "HAULING_TONNAGE", material_type: string) {
    return this.rateCards.find((r) => r.operation_type === operation_type && r.material_type === material_type && r.status === "ACTIVE") ?? null;
  }

  computeFareTonnage(quantity_tons: number, material_type: string) {
    const card = this.getRateCard("HAULING_TONNAGE", material_type);
    if (!card) throw new Error(`Missing rate card for ${material_type}`);
    return quantity_tons * card.rate;
  }

  private getOrCreateWalletForOwner(fleetOwner: FleetOwner) {
    let w = this.wallets.find((x) => x.wallet_type === "OWNER" && x.owner_id === fleetOwner.id);
    if (w) return w;
    w = {
      id: this.idSeq++,
      wallet_type: "OWNER",
      owner_id: fleetOwner.id,
      owner_user_id: fleetOwner.user_id,
      active: fleetOwner.status === "APPROVED",
    };
    this.wallets.push(w);
    return w;
  }

  private getOrCreateWalletForHousehold(h: Household) {
    let w = this.wallets.find((x) => x.wallet_type === "HOUSEHOLD" && x.household_id === h.id);
    if (w) return w;
    w = {
      id: this.idSeq++,
      wallet_type: "HOUSEHOLD",
      household_id: h.id,
      household_user_id: h.user_id,
      active: h.status === "APPROVED",
    };
    this.wallets.push(w);
    return w;
  }

  private getPlatformWallet() {
    let w = this.wallets.find((x) => x.wallet_type === "PLATFORM");
    if (w) return w;
    w = { id: this.idSeq++, wallet_type: "PLATFORM", active: true };
    this.wallets.push(w);
    return w;
  }

  creditMissionShares(params: {
    mission_id: number;
    owner: FleetOwner;
    household: Household;
    material_type: string;
    quantity_tons: number;
  }) {
    const totalFare = this.computeFareTonnage(params.quantity_tons, params.material_type);
    const ownerAmount = totalFare * 0.85;
    const householdAmount = totalFare * 0.13;
    const platformAmount = totalFare * 0.02;

    const ownerWallet = this.getOrCreateWalletForOwner(params.owner);
    const householdWallet = this.getOrCreateWalletForHousehold(params.household);
    const platformWallet = this.getPlatformWallet();

    // Create 3 CREDIT transactions
    if (ownerWallet.active) {
      this.transactions.push({
        id: this.idSeq++,
        wallet_id: ownerWallet.id,
        mission_id: params.mission_id,
        amount: ownerAmount,
        type: "CREDIT",
        description: "MISSION_CREDIT_OWNER",
        created_at: new Date(),
      });
    }

    if (householdWallet.active) {
      this.transactions.push({
        id: this.idSeq++,
        wallet_id: householdWallet.id,
        mission_id: params.mission_id,
        amount: householdAmount,
        type: "CREDIT",
        description: "MISSION_CREDIT_HOUSEHOLD",
        created_at: new Date(),
      });

      this.shares.push({
        id: this.idSeq++,
        household_id: params.household.id,
        mission_id: params.mission_id,
        amount: householdAmount,
        created_at: new Date(),
      });
    }

    this.transactions.push({
      id: this.idSeq++,
      wallet_id: platformWallet.id,
      mission_id: params.mission_id,
      amount: platformAmount,
      type: "CREDIT",
      description: "MISSION_CREDIT_PLATFORM",
      created_at: new Date(),
    });

    return { totalFare, ownerAmount, householdAmount, platformAmount };
  }

  getTransactionsForWallet(walletId: number) {
    return this.transactions.filter((t) => t.wallet_id === walletId).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  findWalletForOwner(ownerId: number) {
    return this.wallets.find((w) => w.wallet_type === "OWNER" && w.owner_id === ownerId) ?? null;
  }

  findWalletForHousehold(householdId: number) {
    return this.wallets.find((w) => w.wallet_type === "HOUSEHOLD" && w.household_id === householdId) ?? null;
  }

  // For UI
  getWalletBalance(walletId: number) {
    const txs = this.transactions.filter((t) => t.wallet_id === walletId);
    let balance = 0;
    for (const t of txs) {
      balance += t.type === "CREDIT" ? t.amount : -t.amount;
    }
    return balance;
  }
}

