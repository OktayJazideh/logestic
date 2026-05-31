import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireMineContext, requireOperationalWorkspace } from "../middleware/requireMineContext";
import { success } from "../http/apiResponse";
import { resolveAuthContext } from "../lib/authContext";
import * as operationTypesRepo from "../repositories/operationTypesRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

router.get("/operation-types", requireAuth, requireMineContext(), requireOperationalWorkspace(), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  try {
    const rows = await operationTypesRepo.listActive();
    res.json(
      success(
        {
          items: rows.map((r) => ({
            id: r.id,
            code: r.code,
            name_fa: r.name_fa,
            category: r.category,
            verification_kind: r.verification_kind,
            pricing_kind: r.pricing_kind,
          })),
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

export const operationTypesRouter = router;
