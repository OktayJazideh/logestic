import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { correlationIdMiddleware } from "./middleware/correlationId";
import { requestLogger } from "./middleware/requestLogger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { mineRouter } from "./routes/mine";
import { driverRouter } from "./routes/driver";
import { devSeedRouter } from "./routes/devSeed";
import { weighbridgeRouter } from "./routes/weighbridge";
import { walletRouter } from "./routes/wallet";
import { ApiError } from "./http/errors";
import { failure } from "./http/apiResponse";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLogger);

  app.get("/api", (_req, res) => res.json({ service: "backend", status: "up" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", mineRouter);
  app.use("/api", driverRouter);
  app.use("/api", devSeedRouter);
  app.use("/api", weighbridgeRouter);
  app.use("/api", walletRouter);

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

    res.status(500).json(failure("internal_error", "Internal server error", undefined, requestId));
    // eslint-disable-next-line no-console
    console.error(err);
  });

  return app;
}

