import { ApiError } from "../http/errors";
import type { AuthContext } from "../middleware/authMiddleware";
import { normalizeRole } from "../types/userRole";

/**
 * Resolve mine for queries/bodies.
 * ADMIN may pass explicit mine_id; others must match session mineId.
 */
export function resolveEffectiveMineId(
  auth: AuthContext,
  requestedMineId?: number | null,
  requestId?: string,
): number {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") {
    const mineId = requestedMineId ?? auth.mineId;
    if (!mineId) {
      throw new ApiError({
        statusCode: 400,
        code: "mine_not_selected",
        message: "Select workspace or pass mine_id",
        requestId,
      });
    }
    return mineId;
  }

  if (!auth.mineId) {
    throw new ApiError({
      statusCode: 400,
      code: "mine_not_selected",
      message: "Select workspace (mine) first",
      requestId,
    });
  }

  if (requestedMineId != null && requestedMineId !== auth.mineId) {
    throw new ApiError({
      statusCode: 403,
      code: "mine_mismatch",
      message: "mine_id must match selected workspace",
      requestId,
    });
  }

  return auth.mineId;
}

/** Batch operations must belong to the session mine (ADMIN bypass). */
export function assertBatchMineScope(
  auth: AuthContext,
  batch: { mine_id?: number | null },
  requestId?: string,
): void {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN") return;
  if (!auth.mineId) {
    throw new ApiError({
      statusCode: 400,
      code: "mine_not_selected",
      message: "Select workspace (mine) first",
      requestId,
    });
  }
  if (batch.mine_id != null && batch.mine_id !== auth.mineId) {
    throw new ApiError({
      statusCode: 403,
      code: "mine_mismatch",
      message: "Batch does not belong to selected mine",
      requestId,
    });
  }
}

/** COOP-scoped routes: cooperative must belong to selected workspace mine. */
export function assertCooperativeMineScope(
  auth: AuthContext,
  cooperativeMineId: number,
  requestId?: string,
): void {
  const role = normalizeRole(auth.user.role);
  if (role === "ADMIN" || role === "OPERATION_ADMIN") return;
  if (!auth.mineId) {
    throw new ApiError({
      statusCode: 400,
      code: "mine_not_selected",
      message: "Select workspace (mine) first",
      requestId,
    });
  }
  if (cooperativeMineId !== auth.mineId) {
    throw new ApiError({
      statusCode: 403,
      code: "mine_mismatch",
      message: "Cooperative mine does not match selected workspace",
      requestId,
    });
  }
}
