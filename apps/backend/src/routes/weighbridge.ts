import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requirePermission, requireRoles } from "../middleware/rbac";
import {
  assertWeighbridgeWeightSubmit,
  requireWeighbridgeApprover,
} from "../middleware/weighbridgeAccess";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { idempotencyMiddleware } from "../middleware/idempotency";
import type { WeighbridgeTicketStatus } from "../stores/missionStore";
import { requireMineContext, requireWeighbridgeWorkspace } from "../middleware/requireMineContext";
import { ingest as weighbridgeIngest } from "../services/weighbridgeIngestService";

const router = Router();

const IngestBodySchema = z.object({
  weighbridge_id: z.number().int().positive(),
  mission_id: z.number().int().positive(),
  reading_type: z.enum(["empty", "loaded"]),
  weight_kg: z.number().positive(),
  captured_at: z.string().min(1),
  plate: z.string().optional(),
  signature: z.string().optional(),
});

router.post("/weighbridge/ingest", async (req, res, next) => {
  try {
    const requestId = (req as { requestId?: string }).requestId;
    const body = IngestBodySchema.safeParse(req.body);
    if (!body.success) {
      return next(
        new ApiError({
          statusCode: 400,
          code: "invalid_request",
          message: "Invalid body",
          details: body.error.flatten(),
          requestId,
        }),
      );
    }

    const apiKey = req.header("X-Weighbridge-Key") ?? undefined;
    const r = await weighbridgeIngest({
      apiKey,
      ...body.data,
    });

    if (!r.ok) {
      const code =
        r.reason === "invalid_weighbridge_key"
          ? "invalid_weighbridge_key"
          : r.reason === "mine_mismatch"
            ? "mine_mismatch"
            : r.reason;
      return next(
        new ApiError({
          statusCode: r.statusCode,
          code,
          message: r.reason,
          requestId,
        }),
      );
    }

    return res.json(
      success(
        {
          ticket_id: r.ticket_id,
          ticket_status: r.ticket_status,
          idempotent: r.idempotent,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

const BOARD_READ_ROLES = ["COOP_ADMIN", "COOP_OPERATOR", "OPERATION_ADMIN", "ADMIN", "COOP"] as const;

const requireAuth = authMiddleware(resolveAuthContext);
const requireOp = [requireAuth, requireMineContext(), requireWeighbridgeWorkspace()] as const;
const idem = idempotencyMiddleware();
const EntrySourceSchema = z.enum(["OPERATOR", "AGENT", "MANUAL"]);
const ReasonCodeSchema = z.enum(["SCALE_DOWN", "NETWORK", "OTHER"]);

router.get(
  "/weighbridge/tickets",
  ...requireOp,
  requireRoles([...BOARD_READ_ROLES]),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const auth = (req as any).auth as AuthContext;
      const mineId = auth.mineId ?? undefined;
      const qStatus = req.query.status as string | undefined;
      const allowed = [
        "PENDING_EMPTY",
        "EMPTY_REGISTERED",
        "LOADED_REGISTERED",
        "PENDING_HOLD",
        "APPROVED",
        "REJECTED",
        "ADJUSTED",
      ];
      const status = qStatus && allowed.includes(qStatus) ? (qStatus as WeighbridgeTicketStatus) : undefined;
      const tickets = await appContext.mission.listTickets({ status, mineId });
      return res.json(success({ tickets }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/weighbridge/tickets/:ticketId",
  ...requireOp,
  requireRoles([...BOARD_READ_ROLES]),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const auth = (req as any).auth as AuthContext;
      const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
      if (!ticketId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
      }
      const ticket = await appContext.mission.getTicketById(ticketId.data);
      if (!ticket) {
        return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
      }
      const mission = await appContext.mission.getMission(ticket.mission_id);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
      }
      if (auth.mineId && mission.mine_id !== auth.mineId) {
        return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
      }
      return res.json(success({ ticket, mission }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/weighbridge/tickets/:ticketId/audit",
  ...requireOp,
  requireRoles([...BOARD_READ_ROLES]),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const auth = (req as any).auth as AuthContext;
      const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
      if (!ticketId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
      }
      const ticket = await appContext.mission.getTicketById(ticketId.data);
      if (!ticket) {
        return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
      }
      const mission = await appContext.mission.getMission(ticket.mission_id);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
      }
      if (auth.mineId && mission.mine_id !== auth.mineId) {
        return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
      }
      const audit_trail = await appContext.mission.getWeighbridgeTicketAuditTrail(ticketId.data);
      return res.json(success({ ticket_id: ticketId.data, audit_trail }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/approve",
  ...requireOp,
  requireWeighbridgeApprover(),
  idem,
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const auth = (req as any).auth as AuthContext;
      const ticketId = z.coerce.number().int().positive().safeParse(req.params.ticketId);
      if (!ticketId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_ticket_id", message: "Invalid ticketId", requestId }));
      }
      const ticket = await appContext.mission.getTicketById(ticketId.data);
      if (!ticket) {
        return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
      }
      const mission = await appContext.mission.getMission(ticket.mission_id);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
      }
      if (auth.mineId && mission.mine_id !== auth.mineId) {
        return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
      }
      if (ticket.status !== "LOADED_REGISTERED" && ticket.status !== "PENDING_HOLD") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "invalid_ticket_state",
            message: "Ticket needs LOADED_REGISTERED or PENDING_HOLD weights before approval",
            requestId,
          }),
        );
      }
      const r = await appContext.mission.weighbridgeApprove({
        ticketId: ticketId.data,
        approvedByUserId: auth.user.id,
        approverRole: auth.user.role,
      });
      if (!r.ok) {
        if (r.reason === "supervisor_approval_required") {
          return next(
            new ApiError({
              statusCode: 409,
              code: "supervisor_approval_required",
              message: "Manual weighbridge entry requires OPERATION_ADMIN approval",
              requestId,
            }),
          );
        }
        if (r.reason === "community_requires_verified_weight") {
          return next(
            new ApiError({
              statusCode: 400,
              code: "community_requires_verified_weight",
              message: "Verified net weight from weighbridge is required for community contribution",
              requestId,
            }),
          );
        }
        const code = r.reason === "invalid_transition" ? "invalid_transition" : "approve_failed";
        return next(new ApiError({ statusCode: 409, code, message: "Cannot approve ticket", details: r.reason, requestId }));
      }
      return res.json(success({ ticket: r.ticket, mission: r.mission, finance: r.finance }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/reject",
  ...requireOp,
  requireWeighbridgeApprover(),
  async (req, res, next) => {
    try {
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
      const ticket = await appContext.mission.getTicketById(ticketId.data);
      if (!ticket) {
        return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
      }
      const mission = await appContext.mission.getMission(ticket.mission_id);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
      }
      if (auth.mineId && mission.mine_id !== auth.mineId) {
        return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
      }
      const r = await appContext.mission.weighbridgeRejectTicket({
        ticketId: ticketId.data,
        reason: body.data.reason,
        rejectedByUserId: auth.user.id,
      });
      if (!r.ok) {
        return next(new ApiError({ statusCode: 409, code: "reject_failed", message: "Cannot reject ticket", details: r.reason, requestId }));
      }
      return res.json(success({ ticket: r.ticket, mission: r.mission }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/weighbridge/tickets/:ticketId/weights",
  ...requireOp,
  idem,
  async (req, res, next) => {
    try {
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
          entry_note: z.string().optional(),
          reason_code: ReasonCodeSchema.optional(),
        })
        .superRefine((d, ctx) => {
          if (d.entry_source === "MANUAL") {
            const note = d.entry_note?.trim() ?? "";
            if (note.length < 20) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "entry_note (min 20 chars) is required when entry_source is MANUAL",
                path: ["entry_note"],
              });
            }
            if (!d.reason_code) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "reason_code is required when entry_source is MANUAL",
                path: ["reason_code"],
              });
            }
          } else if (d.entry_source === "AGENT") {
            const note = d.entry_note?.trim() ?? "";
            if (note.length < 3) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "entry_note (min 3 chars) is required when entry_source is AGENT",
                path: ["entry_note"],
              });
            }
          }
        })
        .safeParse(req.body);
      if (!body.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid body", details: body.error.flatten(), requestId }));
      }
      const access = assertWeighbridgeWeightSubmit(auth, body.data.entry_source);
      if (!access.ok) {
        return next(
          new ApiError({
            statusCode: 403,
            code: "forbidden",
            message: access.message,
            requestId,
          }),
        );
      }
      const ticket = await appContext.mission.getTicketById(ticketId.data);
      if (!ticket) {
        return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
      }
      const mission = await appContext.mission.getMission(ticket.mission_id);
      if (!mission) {
        return next(new ApiError({ statusCode: 404, code: "mission_missing", message: "Mission missing", requestId }));
      }
      if (auth.mineId && mission.mine_id !== auth.mineId) {
        return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Ticket does not belong to selected mine", requestId }));
      }
      const r = await appContext.mission.submitTicketWeights({
        ticketId: ticketId.data,
        empty_weight: body.data.empty_weight,
        loaded_weight: body.data.loaded_weight,
        userId: auth.user.id,
        entrySource: body.data.entry_source,
        entryNote: body.data.entry_note?.trim(),
        reasonCode: body.data.reason_code,
      });
      if (!r.ok) {
        return next(new ApiError({ statusCode: 409, code: "submit_failed", message: "Cannot submit weights", details: r.reason, requestId }));
      }
      return res.json(success({ ticket: r.ticket, anomaly: r.anomaly ?? false }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.get("/weighbridge/adjustments", ...requireOp, requireRoles([...BOARD_READ_ROLES]), async (req, res, next) => {
  try {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const mineId = auth.mineId ?? undefined;
    const qStatus = req.query.status as string | undefined;
    const st = qStatus === "PENDING" || qStatus === "APPROVED" || qStatus === "REJECTED" ? qStatus : undefined;
    const adjustments = await appContext.mission.listAdjustmentRequests({ mineId, status: st });
    return res.json(success({ adjustments }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/weighbridge/adjustments", ...requireOp, requireWeighbridgeApprover(), async (req, res, next) => {
  try {
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
    const ticket = await appContext.mission.getTicketById(body.data.ticket_id);
    if (!ticket) {
      return next(new ApiError({ statusCode: 404, code: "ticket_not_found", message: "Ticket not found", requestId }));
    }
    const mission = await appContext.mission.getMission(ticket.mission_id);
    if (auth.mineId && mission && mission.mine_id !== auth.mineId) {
      return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
    }
    const r = await appContext.mission.createAdjustmentRequest({
      ticketId: body.data.ticket_id,
      reason: body.data.reason,
      after_net: body.data.after_net,
      requestedByUserId: auth.user.id,
    });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "adjustment_failed", message: "Cannot create adjustment", details: r.reason, requestId }));
    }
    return res.json(success({ adjustment: r.adjustment }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/weighbridge/adjustments/:adjustmentId/approve",
  ...requireOp,
  requireWeighbridgeApprover(),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const auth = (req as any).auth as AuthContext;
      const adjustmentId = z.coerce.number().int().positive().safeParse(req.params.adjustmentId);
      if (!adjustmentId.success) {
        return next(new ApiError({ statusCode: 400, code: "invalid_id", message: "Invalid adjustmentId", requestId }));
      }
      const r = await appContext.mission.approveAdjustment({
        adjustmentId: adjustmentId.data,
        approvedByUserId: auth.user.id,
      });
      if (!r.ok) {
        return next(new ApiError({ statusCode: 409, code: "approve_failed", message: "Cannot approve adjustment", details: r.reason, requestId }));
      }
      return res.json(success(r, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/weighbridge/adjustments/:adjustmentId/reject",
  ...requireOp,
  requireWeighbridgeApprover(),
  async (req, res, next) => {
    try {
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
      const r = await appContext.mission.rejectAdjustment({
        adjustmentId: adjustmentId.data,
        reason: body.data.reason,
        rejectedByUserId: auth.user.id,
      });
      if (!r.ok) {
        return next(new ApiError({ statusCode: 409, code: "reject_failed", message: "Cannot reject adjustment", details: r.reason, requestId }));
      }
      return res.json(success({ adjustment: r.adjustment }, requestId));
    } catch (e) {
      next(e);
    }
  },
);

router.post("/missions/:missionId/payment/hold", ...requireOp, requirePermission("hold:create"), idem, async (req, res, next) => {
  try {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!missionId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    const mission = await appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
    }
    if (auth.mineId && mission.mine_id !== auth.mineId) {
      return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
    }
    const r = await appContext.mission.holdMissionPayment({ missionId: mission.id, reason: body.data.reason, userId: auth.user.id });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "hold_failed", message: "Cannot hold payment", details: r.reason, requestId }));
    }
    return res.json(success({ mission: r.mission }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/missions/:missionId/payment/release", ...requireOp, requirePermission("hold:release"), idem, async (req, res, next) => {
  try {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!missionId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    const mission = await appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
    }
    if (auth.mineId && mission.mine_id !== auth.mineId) {
      return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
    }
    const r = await appContext.mission.releaseMissionPayment({ missionId: mission.id, reason: body.data.reason, userId: auth.user.id });
    if (!r.ok) {
      return next(new ApiError({ statusCode: 409, code: "release_failed", message: "Cannot release payment", details: r.reason, requestId }));
    }
    return res.json(success({ mission: r.mission }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/missions/:missionId/payment/reversal", ...requireOp, requirePermission("hold:create"), idem, async (req, res, next) => {
  try {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    const body = z.object({ reason: z.string().min(3) }).safeParse(req.body);
    if (!missionId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    const mission = await appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
    }
    if (auth.mineId && mission.mine_id !== auth.mineId) {
      return next(new ApiError({ statusCode: 403, code: "mine_mismatch", message: "Mine mismatch", requestId }));
    }
    const r = await appContext.mission.reverseMissionPayment({ missionId: mission.id, reason: body.data.reason, userId: auth.user.id });
    if (!r.ok) {
      if (r.reason === "reverse_window_expired") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "reverse_window_expired",
            message: "پنجرهٔ زمانی Reverse بسته شده است. از Adjustment Request استفاده کنید.",
            details: { reason: r.reason, window_hours: r.window_hours },
            requestId,
          }),
        );
      }
      if (r.reason === "cannot_reverse_settled") {
        return next(
          new ApiError({
            statusCode: 409,
            code: "cannot_reverse_settled",
            message: "ماموریت تسویه‌شده است؛ فقط از endpoint adjustment/post-settled استفاده کنید.",
            details: { reason: r.reason },
            requestId,
          }),
        );
      }
      return next(new ApiError({ statusCode: 409, code: "reversal_failed", message: "Cannot reverse payment", details: r.reason, requestId }));
    }
    return res.json(success({ mission: r.mission }, requestId));
  } catch (e) {
    next(e);
  }
});

router.post("/missions/:missionId/adjustment/post-settled", ...requireOp, requireRoles(["ADMIN"]), async (req, res, next) => {
  try {
    const requestId = (req as any).requestId as string | undefined;
    const auth = (req as any).auth as AuthContext;
    const missionId = z.coerce.number().int().positive().safeParse(req.params.missionId);
    const body = z
      .object({
        reason: z.string().min(3),
        bank_reference: z.string().min(3).optional(),
      })
      .safeParse(req.body);
    if (!missionId.success || !body.success) {
      return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid input", requestId }));
    }
    const mission = await appContext.mission.getMission(missionId.data);
    if (!mission) {
      return next(new ApiError({ statusCode: 404, code: "mission_not_found", message: "Mission not found", requestId }));
    }
    const r = await appContext.mission.createPostSettledAdjustment({
      missionId: mission.id,
      reason: body.data.reason,
      bank_reference: body.data.bank_reference,
      userId: auth.user.id,
    });
    if (!r.ok) {
      return next(
        new ApiError({
          statusCode: 409,
          code: "adjustment_failed",
          message: "Cannot create post-settled adjustment",
          details: r.reason,
          requestId,
        }),
      );
    }
    return res.json(success({ adjustment: r.adjustment }, requestId));
  } catch (e) {
    next(e);
  }
});

export const weighbridgeRouter = router;
