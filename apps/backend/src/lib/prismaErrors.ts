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
    if (err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      if (target.includes("bank_iban") || target.includes("iban")) {
        return new ApiError({
          statusCode: 409,
          code: "iban_taken",
          message: "Bank IBAN is already registered",
          requestId,
        });
      }
      if (target.includes("mobile_number") || target.includes("upr_pending_mobile")) {
        return new ApiError({
          statusCode: 409,
          code: "mobile_pending",
          message: "Mobile number has a pending provisioning request",
          requestId,
        });
      }
      if (target.includes("national_id") || target.includes("upr_pending_national")) {
        return new ApiError({
          statusCode: 409,
          code: "national_id_pending",
          message: "A pending provisioning request already exists for this national ID",
          requestId,
        });
      }
    }
  }
  if (err instanceof TypeError) {
    const msg = err.message;
    if (msg.includes("user_provisioning_requests") || msg.includes("findMany")) {
      return new ApiError({
        statusCode: 503,
        code: "schema_not_ready",
        message: "Prisma client is out of date. Run: npx prisma generate && systemctl restart logestic-api",
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
