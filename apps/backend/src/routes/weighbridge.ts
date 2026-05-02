import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import type { WeighbridgeTicketStatus } from "../stores/missionStore";

const router = Router();

/** Roles that may view weighbridge board / tickets (بخش ۱۳، اپراتور/تعاونی). */
const BOARD_READ_ROLES = ["CONSULTANT", "COOP", "ADMIN"] as const;
/** Submit weights: اپراتور پنل + مسیر ایجنت/دستی پس از Q11 (CONSULTANT/ADMIN). */
const WEIGHT_ENTRY_ROLES = ["CONSULTANT", "ADMIN"] as const;

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

const EntrySourceSchema = z.enum(["OPERATOR", "AGENT", "MANUAL"]);

router.get(
  "/weighbridge/tickets",
  requireAuth,
  requireRoles([...BOARD_READ_ROLES]),
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

router.get(
  "/weighbridge/tickets/:ticketId",
  requireAuth,
  requireRoles([...BOARD_READ_ROLES]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
    if (!ticketId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
    }

    const ticket = appContext.mission.getTicketById(ticketId.data);
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

    return res.json(success({ ticket, mission }, requestId));
  },
);

router.get(
  "/weighbridge/tickets/:ticketId/audit",
  requireAuth,
  requireRoles([...BOARD_READ_ROLES]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
    if (!ticketId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
    }

    const ticket = appContext.mission.getTicketById(ticketId.data);
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

    const audit_trail = appContext.mission.getWeighbridgeTicketAuditTrail(ticketId.data);
    return res.json(success({ ticket_id: ticketId.data, audit_trail }, requestId));
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/approve",
  requireAuth,
  requireRoles(["CONSULTANT", "ADMIN"]),
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

    const r = appContext.mission.weighbridgeApprove({ ticketId: ticketId.data, approvedByUserId: auth.user.id });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve ticket", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket, mission: r.mission, finance: r.finance }, requestId));
  },
);

/** Q10: رد رسمی تیکت قبل از واریز (مغایرت/خطا). */
router.post(
  "/weighbridge/tickets/:ticketId/reject",
  requireAuth,
  requireRoles(["CONSULTANT", "ADMIN"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
    if (!ticketId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
    }

    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }

    const ticket = appContext.mission.getTicketById(ticketId.data);
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

    const r = appContext.mission.weighbridgeRejectTicket({
      ticketId: ticketId.data,
      reason: body.data.reason,
      rejectedByUserId: auth.user.id,
    });

    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "reject_failed", message: "Cannot reject ticket", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket, mission: r.mission }, requestId));
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/weights",
  requireAuth,
  requireRoles([...WEIGHT_ENTRY_ROLES]),
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
        entry_source: EntrySourceSchema.optional().default("OPERATOR"),
        entry_note: z.string().min(3).optional(),
      })
      .refine(
        (d) =>
          d.entry_source === "OPERATOR" || (d.entry_note !== undefined && d.entry_note.trim().length >= 3),
        { message: "entry_note (min 3 chars) is required when entry_source is AGENT or MANUAL", path: ["entry_note"] },
      )
      .safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", details: body.error.flatten(), requestId }));
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
      entrySource: body.data.entry_source,
      entryNote: body.data.entry_note?.trim(),
    });

    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "submit_failed", message: "Cannot submit weights", details: r.reason, requestId }));
    }

    return res.json(success({ ticket: r.ticket }, requestId));
  },
);

router.get("/weighbridge/adjustments", requireAuth, requireRoles([...BOARD_READ_ROLES]), (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const auth = (req as any).auth as AuthContext;
  const mineId = auth.mineId ?? undefined;
  const qStatus = req.query.status as string | undefined;
  const st =
    qStatus === "PENDING" || qStatus === "APPROVED" || qStatus === "REJECTED" ? qStatus : undefined;
  const list = appContext.mission.listAdjustmentRequests({ mineId, status: st });
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

/** Q10: رد درخواست اصلاح وزن (رویه رسمی کنار approve). */
router.post(
  "/weighbridge/adjustments/:adjustmentId/reject",
  requireAuth,
  requireRoles(["CONSULTANT", "ADMIN"]),
  (req, res, next) => {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;

    const adjustmentId = z.coerce.number().int().positive().safeParse(req.params.adjustmentId);
    if (!adjustmentId.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid adjustmentId", requestId }));
    }

    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", requestId }));
    }

    const r = appContext.mission.rejectAdjustment({
      adjustmentId: adjustmentId.data,
      reason: body.data.reason,
      rejectedByUserId: auth.user.id,
    });

    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "reject_failed", message: "Cannot reject adjustment", details: r.reason, requestId }));
    }

    return res.json(success({ adjustment: r.adjustment }, requestId));
  },
);

export const weighbridgeRouter = router;
