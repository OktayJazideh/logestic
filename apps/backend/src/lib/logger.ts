import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
