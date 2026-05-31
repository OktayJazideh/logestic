import { Router } from "express";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbac";
import { requireMineContext } from "../middleware/requireMineContext";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { resolveEffectiveMineId } from "../lib/mineScope";
import { ruleEngine } from "../services/ruleEngine";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);

function walletMineFilter(auth: AuthContext): { mine_id?: number } {
  if (!auth.mineId) return {};
  return { mine_id: auth.mineId };
}

router.get("/wallet/owner", requireAuth, requireMineContext(), requirePermission("wallet:read_own"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  try {
    const owner = appContext.entities.findFleetOwnerByUserId(auth.user.id);
    if (!owner) {
      return next(new ApiError({ statusCode: 404, code: "owner_not_found", message: "Owner not found", requestId }));
    }

    const wallet = await appContext.finance.findWalletForOwner(owner.id, owner.user_id, owner.status === "APPROVED");
    if (!wallet) {
      return next(new ApiError({ statusCode: 404, code: "wallet_not_found", message: "Wallet not found", requestId }));
    }

    const mineFilter = walletMineFilter(auth);
    const balance = await appContext.finance.getWalletBalance(wallet.id, mineFilter);
    const txs = await appContext.finance.getTransactionsForWallet(wallet.id, mineFilter);

    return res.json(success({ wallet, balance, transactions: txs, mine_id: auth.mineId ?? null }, requestId));
  } catch (e) {
    next(e);
  }
});

router.get("/wallet/household", requireAuth, requirePermission("wallet:read_own"), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  try {
    const household = appContext.entities.findHouseholdByUserId(auth.user.id);
    if (!household) {
      return next(new ApiError({ statusCode: 404, code: "household_not_found", message: "Household not found", requestId }));
    }

    const wallet = await appContext.finance.findWalletForHousehold(
      household.id,
      household.user_id,
      household.status === "APPROVED",
    );
    if (!wallet) {
      return next(new ApiError({ statusCode: 404, code: "wallet_not_found", message: "Wallet not found", requestId }));
    }

    const queryMine = typeof req.query.mine_id === "string" ? Number(req.query.mine_id) : undefined;
    let mineId: number | undefined;
    if (auth.mineId) {
      mineId = resolveEffectiveMineId(auth, queryMine, requestId);
    } else {
      const village = appContext.mineData
        .listMines()
        .flatMap((m) => appContext.mineData.listVillagesByMine(m.id))
        .find((v) => v.id === household.village_id);
      mineId = village?.mine_id;
    }
    const mineFilter = mineId != null ? { mine_id: mineId } : {};
    const balance = await appContext.finance.getWalletBalance(wallet.id, mineFilter);
    const txs = await appContext.finance.getTransactionsForWallet(wallet.id, mineFilter);

    const village = appContext.mineData
      .listMines()
      .flatMap((m) => appContext.mineData.listVillagesByMine(m.id))
      .find((v) => v.id === household.village_id);
    const community_rial_per_ton = await ruleEngine.getCommunityRialPerTon({
      mineId: village?.mine_id,
      cooperativeId: household.cooperative_id,
    });

    return res.json(
      success({ wallet, balance, transactions: txs, community_rial_per_ton, mine_id: mineId ?? null }, requestId),
    );
  } catch (e) {
    next(e);
  }
});

export const walletRouter = router;
