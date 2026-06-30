import "./lib/env";
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  if (process.env.DATABASE_URL) {
    try {
      const result = await seedIfEmpty();
      if (result.seeded) {
        logger.info({ count: result.count }, "Seeded wholesalers + catalog");
      } else {
        logger.info("DB already seeded — skipping");
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "Seed failed (tables may not exist yet — run `pnpm --filter @workspace/db run push`)");
    }
  } else {
    logger.warn("DATABASE_URL not set — server running in degraded mode (orders will not persist)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err: err?.message }, "Startup failed");
  process.exit(1);
});
