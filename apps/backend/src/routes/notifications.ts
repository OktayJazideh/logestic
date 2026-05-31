import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/authMiddleware";
import { resolveAuthContext } from "../lib/authContext";
import { success } from "../http/apiResponse";
import * as notificationsRepo from "../repositories/notificationsRepository";

const router = Router();
const requireAuth = authMiddleware(resolveAuthContext);

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const requestId = (req as { requestId?: string }).requestId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as { user: { id: number } };
    const query = z
      .object({
        unread_only: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(req.query);

    if (!query.success) {
      return res.status(400).json({ success: false, error: { code: "invalid_request", message: "Invalid query" } });
    }

    const items = await notificationsRepo.listNotificationsForUser({
      user_id: auth.user.id,
      channel: "in_app",
      unread_only: query.data.unread_only,
      limit: query.data.limit,
    });

    const preferences = await notificationsRepo.getNotificationPreferences(auth.user.id);

    return res.json(
      success(
        {
          notifications: items,
          preferences,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

export { router as notificationsRouter };
