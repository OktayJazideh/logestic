import { Router } from "express";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { success } from "../http/apiResponse";

const router = Router();

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

router.get("/rate-cards", requireAuth, requireRoles(["ADMIN", "CONSULTANT", "COOP", "EMPLOYER"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const cards = appContext.finance.listRateCards();
  return res.json(success({ rate_cards: cards }, requestId));
});

export const rateCardsRouter = router;
