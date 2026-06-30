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
  try {
    const result = await seedIfEmpty();
    if (result.seeded) {
      logger.info({ count: result.count }, "Seeded wholesalers + catalog into Firestore");
    } else {
      logger.info("Firestore already seeded — skipping");
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "Seed failed");
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
