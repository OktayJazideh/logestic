import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { requireRoles } from "../middleware/rbac";
import { ApiError } from "../http/errors";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import { listStaleApprovalTasks } from "../lib/approvalTasks";
import * as cooperativesRepo from "../repositories/cooperativesRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

const staleReaders = [requireAuth, requireRoles(["ADMIN", "OPERATION_ADMIN", "COOP_ADMIN"])] as const;

/** SLA-ESCALATION-1: overdue approval tasks (PENDING + due_at &lt; now). */
router.get("/admin/approvals/stale", ...staleReaders, async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  const auth = (req as typeof req & { auth: AuthContext }).auth;
  const q = z
    .object({
      mine_id: z.coerce.number().int().positive().optional(),
    })
    .safeParse(req.query);
  if (!q.success) {
    return next(new ApiError({ statusCode: 400, code: "invalid_request", message: "Invalid query", requestId }));
  }
  try {
    let mine_id = q.data.mine_id;
    if (auth.user.role === "COOP_ADMIN" && auth.user.cooperative_id != null) {
      const coop = await cooperativesRepo.findCooperativeById(auth.user.cooperative_id);
      if (coop) mine_id = coop.mine_id;
    }
    const tasks = await listStaleApprovalTasks({ mine_id });
    return res.json(success({ tasks, count: tasks.length }, requestId));
  } catch (e) {
    next(e);
  }
});

export const adminApprovalsRouter = router;
