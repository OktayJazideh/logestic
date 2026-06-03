import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { correlationIdMiddleware } from "./middleware/correlationId";
import { requestLogger } from "./middleware/requestLogger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { mineRouter } from "./routes/mine";
import { workspacesRouter } from "./routes/workspaces";
import { driverRouter } from "./routes/driver";
import { devSeedRouter } from "./routes/devSeed";
import { weighbridgeRouter } from "./routes/weighbridge";
import { walletRouter } from "./routes/wallet";
import { hourlyRouter } from "./routes/hourly";
import { settlementRouter } from "./routes/settlement";
import { rateCardsRouter } from "./routes/rateCards";
import { serviceContractsRouter } from "./routes/serviceContracts";
import { operationTypesRouter } from "./routes/operationTypes";
import { coopRouter } from "./routes/coop";
import { coopKycRouter } from "./routes/coopKyc";
import { householdsRouter } from "./routes/households";
import { adminRouter } from "./routes/admin";
import { userProvisioningRouter } from "./routes/userProvisioning";
import { jobsRouter } from "./routes/jobs";
import { employerRouter } from "./routes/employer";
import { notificationsRouter } from "./routes/notifications";
import { auditRouter } from "./routes/audit";
import { inboxRouter } from "./routes/inbox";
import { fleetOwnerRouter } from "./routes/fleetOwner";
import { webhooksRouter } from "./routes/webhooks";
import { ApiError } from "./http/errors";
import { failure } from "./http/apiResponse";
import { prismaToApiError } from "./lib/prismaErrors";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLogger);

  app.get("/api", (_req, res) => res.json({ service: "backend", status: "up" }));

  app.use("/api/health", healthRouter);
  app.get("/api/healthz", async (_req, res, next) => {
    try {
      const { buildHealthPayload } = await import("./routes/health");
      const payload = await buildHealthPayload();
      res.status(payload.ok ? 200 : 503).json(payload);
    } catch (e) {
      next(e);
    }
  });
  app.use("/api/auth", authRouter);
  app.use("/api", mineRouter);
  app.use("/api", workspacesRouter);
  app.use("/api", driverRouter);
  app.use("/api", devSeedRouter);
  app.use("/api", weighbridgeRouter);
  app.use("/api", walletRouter);
  app.use("/api", hourlyRouter);
  app.use("/api", settlementRouter);
  app.use("/api", rateCardsRouter);
  app.use("/api", serviceContractsRouter);
  app.use("/api", operationTypesRouter);
  app.use("/api", coopRouter);
  app.use("/api", coopKycRouter);
  app.use("/api", householdsRouter);
  app.use("/api", adminRouter);
  app.use("/api", userProvisioningRouter);
  app.use("/api", jobsRouter);
  app.use("/api", employerRouter);
  app.use("/api", notificationsRouter);
  app.use("/api", auditRouter);
  app.use("/api", inboxRouter);
  app.use("/api", fleetOwnerRouter);
  app.use("/api/webhooks", webhooksRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Generic error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = (req as any).requestId as string | undefined;

    if (err instanceof ApiError) {
      res.status(err.statusCode).json(
        failure(err.code, err.message, err.details, err.requestId ?? requestId),
      );
      return;
    }

    const prismaErr = prismaToApiError(err, requestId);
    if (prismaErr) {
      res.status(prismaErr.statusCode).json(
        failure(prismaErr.code, prismaErr.message, prismaErr.details, prismaErr.requestId ?? requestId),
      );
      return;
    }

    res.status(500).json(failure("internal_error", "Internal server error", undefined, requestId));
    void import("./lib/logger").then(({ logger }) => logger.error({ err, requestId }, "unhandled_error"));
  });

  return app;
}

