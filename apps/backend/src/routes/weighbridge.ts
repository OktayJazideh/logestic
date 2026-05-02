import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import type { WeighbridgeTicketStatus } from "../stores/missionStore";

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
    const qStatus = req.query.status as string | undefined;
    const allowed = [
      "PENDING_EMPTY",
      "EMPTY_REGISTERED",
      "LOADED_REGISTERED",
      "APPROVED",
      "REJECTED",
      "ADJUSTED",
    ];
    const status = qStatus && allowed.includes(qStatus) ? (qStatus as WeighbridgeTicketStatus) : undefined;
    const result = appContext.mission.listTickets({ status, mineId });
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

    if (ticket.status !== "LOADED_REGISTERED") {
      return next(
        new ApiError({
          statusCode: 409,
          code: "invalid_ticket_state",
          message: "Ticket needs LOADED_REGISTERED weights before approval",
          requestId,
        }),
      );
    }

    const r = appContext.mission.weighbridgeApprove({ ticketId: ticketId.data });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve ticket", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket, mission: r.mission, finance: r.finance }, requestId));
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/weights",
  requireAuth,
  requireRoles(["CONSULTANT", "ADMIN"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
    if (!ticketId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
    }

    const body = z
      .object({
        empty_weight: z.number(),
        loaded_weight: z.number(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
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

    const r = appContext.mission.submitTicketWeights({
      ticketId: ticketId.data,
      empty_weight: body.data.empty_weight,
      loaded_weight: body.data.loaded_weight,
      userId: auth.user.id,
    });

    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "submit_failed", message: "Cannot submit weights", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket }, requestId));
  },
);

router.get("/weighbridge/adjustments", requireAuth, requireRoles(["CONSULTANT", "ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId ?? undefined;
  const list = appContext.mission.listAdjustmentRequests({ mineId });
  return res.json(success({ adjustments: list }, requestId));
});

router.post("/weighbridge/adjustments", requireAuth, requireRoles(["CONSULTANT", "ADMIN"]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;

  const body = z
    .object({
      ticket_id: z.number().int().positive(),
      reason: z.string().min(3),
      after_net: z.number(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
  }

  const ticket = appContext.mission.listTickets().find((t) => t.id === body.data.ticket_id) ?? null;
  if (!ticket) {
    return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
  }
  const mission = appContext.mission.getMission(ticket.mission_id);
  if (auth.mineId && mission && mission.mine_id !== auth.mineId) {
    return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
  }

  const r = appContext.mission.createAdjustmentRequest({
    ticketId: body.data.ticket_id,
    reason: body.data.reason,
    after_net: body.data.after_net,
    requestedByUserId: auth.user.id,
  });

  if (!r.ok) {
    return next(new ApiError({ statusCode: 409, code: "adjustment_failed", message: "Cannot create adjustment", details: r.reason, requestId }));
  }

  return res.json(success({ adjustment: r.adjustment }, requestId));
});

router.post(
  "/weighbridge/adjustments/:adjustmentId/approve",
  requireAuth,
  requireRoles(["CONSULTANT", "ADMIN"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const adjustmentId = z.coerce.number().int().positive().safeParse(req.params.adjustmentId);
    if (!adjustmentId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid adjustmentId", requestId }));
    }

    const r = appContext.mission.approveAdjustment({
      adjustmentId: adjustmentId.data,
      approvedByUserId: auth.user.id,
    });

    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve adjustment", details: r.reason, requestId }));
    }

    return res.json(success(r, requestId));
  },
);

export const weighbridgeRouter = router;

