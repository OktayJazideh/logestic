import { ApiError } from "../http/errors";

/** Missing per-mine finance config (platform fee, active service contract / community rate). */
export class MineConfigIncompleteError extends ApiError {
  constructor(mineId: number, missing: string[], requestId?: string) {
    super({
      statusCode: 400,
      code: "mine_config_incomplete",
      message: "تنظیمات معدن ناقص",
      details: { mine_id: mineId, missing },
      requestId,
    });
    this.name = "MineConfigIncompleteError";
  }
}

export function isMineConfigIncompleteError(err: unknown): err is MineConfigIncompleteError {
  return err instanceof MineConfigIncompleteError;
}
