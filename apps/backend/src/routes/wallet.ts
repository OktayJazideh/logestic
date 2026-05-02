import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";

const router = Router();

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

router.get("/wallet/owner", requireAuth, requireRoles(["FLEET_OWNER"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const owner = appContext.entities.findFleetOwnerByUserId(auth.user.id);
  if (!owner) {
    return next(new ApiError({ statusCode: 404, code: "owner_not_found", message: "Owner not found", requestId }));
  }

  const wallet = appContext.finance.findWalletForOwner(owner.id);
  if (!wallet) {
    return next(new ApiError({ statusCode: 404, code: "wallet_not_found", message: "Wallet not found", requestId }));
  }

  const balance = appContext.finance.getWalletBalance(wallet.id);
  const txs = appContext.finance.getTransactionsForWallet(wallet.id);

  return res.json(success({ wallet, balance, transactions: txs }, requestId));
});

router.get("/wallet/household", requireAuth, requireRoles(["HOUSEHOLD"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const household = appContext.entities.findHouseholdByUserId(auth.user.id);
  if (!household) {
    return next(new ApiError({ statusCode: 404, code: "household_not_found", message: "Household not found", requestId }));
  }

  const wallet = appContext.finance.findWalletForHousehold(household.id);
  if (!wallet) {
    return next(new ApiError({ statusCode: 404, code: "wallet_not_found", message: "Wallet not found", requestId }));
  }

  const balance = appContext.finance.getWalletBalance(wallet.id);
  const txs = appContext.finance.getTransactionsForWallet(wallet.id);

  return res.json(success({ wallet, balance, transactions: txs }, requestId));
});

export const walletRouter = router;

