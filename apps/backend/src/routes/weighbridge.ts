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

router.get(
  "/weighbridge/tickets",
  requireAuth,
  requireRoles(["CONSULTANT"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const mineId = auth.mineId ?? undefined;
    const result = appContext.mission.listTickets({ status: "PENDING_EMPTY", mineId });
    return res.json(success({ tickets: result }, requestId));
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/approve",
  requireAuth,
  requireRoles(["CONSULTANT"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
    if (!ticketId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
    }

    const ticket = appContext.mission.listTickets().find((t) => t.id === ticketId.data) ?? null;
    if (!ticket) {
      return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
    }

    const mission = appContext.mission.getMission(ticket.mission_id);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
    }

    if (auth.mineId && mission.mine_id !== auth.mineId) {
      return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
    }

    if (ticket.status !== "PENDING_EMPTY" && ticket.status !== "EMPTY_REGISTERED") {
      return next(new ApiError({ statusCode: 409, code: "invalid_ticket_state", message: "Ticket not in approvable state", requestId }));
    }

    const r = appContext.mission.weighbridgeApprove({ ticketId: ticketId.data });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve ticket", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket, mission: r.mission, finance: r.finance }, requestId));
  },
);

export const weighbridgeRouter = router;

