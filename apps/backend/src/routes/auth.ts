import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";
import { failure, success } from "../http/apiResponse";
import { appContext } from "../appContext";

const router = Router();

const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

const MobileSchema = z
  .string()
  .trim()
  .regex(/^\d{9,15}$/, { message: "mobile_number must be numeric and 9-15 digits" });

router.post("/request-otp", (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const body = z
    .object({
      mobile_number: MobileSchema,
    })
    .safeParse(req.body);

  if (!body.success) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "Invalid input",
        details: body.error.flatten(),
        requestId,
      }),
    );
  }

  const { mobile_number } = body.data;
  const result = appContext.authService.requestOtp(mobile_number);
  if (!result.allowed) {
    return next(
      new ApiError({
        statusCode: 429,
        code: "rate_limited",
        message: "Too many OTP requests. Try later.",
        details: { retryAfterSeconds: result.retryAfterSeconds },
        requestId,
      }),
    );
  }

  return res.json(
    success(
      {
        expires_in_seconds: result.expiresInSeconds,
      },
      requestId,
    ),
  );
});

router.post("/verify-otp", (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const body = z
    .object({
      mobile_number: MobileSchema,
      otp_code: z.string().regex(/^\d{6}$/, { message: "otp_code must be 6 digits" }),
    })
    .safeParse(req.body);

  if (!body.success) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_request",
        message: "Invalid input",
        details: body.error.flatten(),
        requestId,
      }),
    );
  }

  const { mobile_number, otp_code } = body.data;
  const result = appContext.authService.verifyOtp(mobile_number, otp_code);
  if (!result.ok) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "otp_verification_failed",
        message: "OTP invalid or expired.",
        details: { reason: result.reason, attemptsLeft: result.attemptsLeft },
        requestId,
      }),
    );
  }

  // Audit: OTP verification is an important event.
  appContext.auditStore.record({
    entity_type: "AUTH",
    entity_id: mobile_number,
    action: "AUTH_OTP_VERIFIED",
    performed_by_user_id: undefined,
    reason: undefined,
    requestId,
    before_value: undefined,
    after_value: { role: result.session.role },
  });

  return res.json(
    success(
      {
        access_token: result.session.token,
        role: result.session.role,
      },
      requestId,
    ),
  );
});

router.get("/me", requireAuth, (req, res) => {
  const requestId = (req as any).requestId as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (req as any).auth as AuthContext;
  return res.json(
    success(
      {
        id: auth.user.id,
        mobile_number: auth.user.mobile_number,
        role: auth.user.role,
        is_active: auth.user.is_active,
      },
      requestId,
    ),
  );
});

router.get("/myProfile", requireAuth, (req, res) => {
  const requestId = (req as any).requestId as string | undefined;
  // For MVP: profile details are part of role/KYC in later phases.
  return res.json(
    success(
      {
        note: "MVP profile details will be filled after KYC flows are implemented.",
      },
      requestId,
    ),
  );
});

router.get("/myPermissions", requireAuth, (req, res) => {
  const requestId = (req as any).requestId as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (req as any).auth as AuthContext;
  const perms = appContext.authService.listMyPermissions(auth.user.role);
  return res.json(
    success(
      {
        role: auth.user.role,
        permissions: perms,
      },
      requestId,
    ),
  );
});

// DEV endpoint to view in-memory audit logs.
// Disable or remove before production.
router.get("/__dev/audit", (_req, res) => {
  return res.json(
    success({
      items: appContext.auditStore.getAll(),
    }),
  );
});

// DEV helper: return current OTP for a mobile number (for local debugging).
// WARNING: Remove in production.
router.get("/__dev/otp", (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  const mobile = z.string().trim().regex(/^\d{9,15}$/).safeParse(req.query.mobile_number).success
    ? String(req.query.mobile_number)
    : null;
  if (!mobile) {
    return next(
      new ApiError({
        statusCode: 400,
        code: "invalid_mobile",
        message: "Invalid mobile_number",
        requestId,
      }),
    );
  }
  const otp = appContext.otpStore.debugGetOtp(mobile);
  if (!otp) {
    return res.status(404).json(failure("otp_not_found", "OTP not found", undefined, requestId));
  }
  return res.json(
    success(
      {
        mobile_number: mobile,
        otp: otp.otp,
        expiresAt: otp.expiresAt,
      },
      requestId,
    ),
  );
});

export const authRouter = router;

