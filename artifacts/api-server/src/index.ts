import app from "./app";
import { logger } from "./lib/logger";
import { ensureDemoAccounts } from "./lib/demoAccounts";
import { runStartupMigrations } from "./lib/migrations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Converge the schema (idempotent) so new environments get job_notes +
  // the legacy-note backfill without a manual push.
  runStartupMigrations().catch(() => process.exit(1));

  // Dev-only: self-heal the demo accounts so the sign-in page's demo
  // buttons always work (no-op with a production Clerk key).
  void ensureDemoAccounts();
});
