import { Prisma } from "@prisma/client";
import { ApiError } from "../http/errors";

/** Map Prisma failures to API errors (migration missing, etc.). */
export function prismaToApiError(err: unknown, requestId?: string): ApiError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021") {
      return new ApiError({
        statusCode: 503,
        code: "schema_not_ready",
        message:
          "Database schema is out of date. Run prisma migrate deploy (migration 0045_user_provisioning).",
        requestId,
      });
    }
    if (err.code === "P2022") {
      return new ApiError({
        statusCode: 503,
        code: "schema_not_ready",
        message: "Database column missing. Run prisma migrate deploy.",
        requestId,
      });
    }
  }
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (code === "workspace_access_denied") {
      return new ApiError({
        statusCode: 403,
        code: "workspace_access_denied",
        message: "Workspace access denied for this mine",
        requestId,
      });
    }
  }
  return null;
}
