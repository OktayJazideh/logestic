import { createApp } from "./app";
import { env } from "./config/env";
import { initAppContext } from "./lib/appInit";
import { prisma } from "./db/prisma";
import { logger } from "./lib/logger";

async function main() {
  await initAppContext();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "backend_listening");
  });
}

async function shutdown() {
  await prisma.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => void shutdown().then(() => process.exit(0)));
}

main().catch((e) => {
  logger.fatal({ err: e }, "backend_startup_failed");
  void shutdown().finally(() => process.exit(1));
});

