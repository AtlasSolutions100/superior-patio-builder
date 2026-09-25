import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  jobsTable,
  appUsersTable,
  commissionTiersTable,
  integrationsTable,
  commissionFor,
  type Integration,
  type Job,
} from "@workspace/db";
import { logger } from "./logger";
import { getStage, stageKeys } from "./stages";
import * as qbo from "./quickbooks";
import * as sheets from "./googleSheets";

/**
 * What happens to a job the moment it becomes sold work: it is pushed to
 * QuickBooks as a Customer and appended to the connected Google Sheet.
 *
 * Both pushes are best-effort and independent. A failure is recorded on the
 * integration row (surfaced in Settings) and never blocks the stage move —
 * an outage at Intuit must not stop Justin from marking a job sold.
 * Every push is idempotent: the job remembers what was already synced.
 */

export interface SheetsConfig {
  spreadsheetId: string | null;
  sheetName: string;
  enabled: boolean;
}

export async function sheetsConnection(): Promise<{ row: Integration | null; config: SheetsConfig }> {
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.provider, "google_sheets"));
  const c = (row?.config ?? {}) as Partial<SheetsConfig>;
  return {
    row: row ?? null,
    config: {
      spreadsheetId: c.spreadsheetId ?? process.env.SPC_SHEET_ID?.trim() ?? null,
      sheetName: c.sheetName?.trim() || sheets.DEFAULT_SHEET_NAME,
      enabled: c.enabled ?? false,
    },
  };
}

async function recordResult(provider: "quickbooks" | "google_sheets", error: string | null) {
  await db
    .insert(integrationsTable)
    .values({ provider, lastError: error, ...(error ? {} : { lastSyncAt: new Date() }) })
    .onConflictDoUpdate({
      target: integrationsTable.provider,
      set: { lastError: error, ...(error ? {} : { lastSyncAt: new Date() }) },
    });
}

async function rowExtras(job: Job): Promise<sheets.RowExtras> {
  const tiers = await db
    .select({ upToAmount: commissionTiersTable.upToAmount, ratePercent: commissionTiersTable.ratePercent })
    .from(commissionTiersTable);
  let soldByName: string | null = null;
  if (job.soldByUserId != null) {
    const [u] = await db
      .select({ name: appUsersTable.name, username: appUsersTable.username, email: appUsersTable.email })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, job.soldByUserId));
    soldByName = u ? u.name || u.username || u.email || null : null;
  }
  const stage = await getStage(job.stage);
  return {
    soldByName,
    commissionAmount: commissionFor(job.contractAmount == null ? null : Number(job.contractAmount), tiers),
    stageLabel: stage?.label ?? job.stage,
    dateSold: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Per-provider pushes
// ---------------------------------------------------------------------------
export async function pushToQuickBooks(job: Job): Promise<"synced" | "skipped"> {
  if (job.qboCustomerId) return "skipped";
  const env = qbo.qboEnv();
  if (!env) return "skipped";
  const conn = await qbo.getConnection();
  if (!conn?.refreshToken) return "skipped";

  try {
    const customerId = await qbo.findOrCreateCustomer(env, job);
    await db.update(jobsTable).set({ qboCustomerId: customerId }).where(eq(jobsTable.id, job.id));
    await recordResult("quickbooks", null);
    logger.info({ jobId: job.id, customerId }, "Pushed job to QuickBooks");
    return "synced";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordResult("quickbooks", message);
    logger.error({ err, jobId: job.id }, "QuickBooks push failed");
    throw err;
  }
}

export async function pushToSheet(job: Job): Promise<"synced" | "skipped"> {
  if (job.sheetSyncedAt) return "skipped";
  const sa = sheets.serviceAccount();
  const { config } = await sheetsConnection();
  if (!sa || !config.enabled || !config.spreadsheetId) return "skipped";

  try {
    const row = sheets.jobToRow(job, await rowExtras(job));
    await sheets.appendJobRow(sa, config.spreadsheetId, config.sheetName, row);
    await db.update(jobsTable).set({ sheetSyncedAt: new Date() }).where(eq(jobsTable.id, job.id));
    await recordResult("google_sheets", null);
    logger.info({ jobId: job.id }, "Appended job to Google Sheet");
    return "synced";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordResult("google_sheets", message);
    logger.error({ err, jobId: job.id }, "Google Sheet append failed");
    throw err;
  }
}

/**
 * Fire-and-forget hook for the stage-move and create routes. Each provider
 * runs independently so one failing cannot mask the other.
 */
export function onJobSold(jobId: number): void {
  void (async () => {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) return;
    await Promise.allSettled([pushToQuickBooks(job), pushToSheet(job)]);
  })();
}

// ---------------------------------------------------------------------------
// Backfill: push every sold job that hasn't been synced yet. Used right
// after connecting a service so existing work lands there too.
// ---------------------------------------------------------------------------
export interface SyncResult {
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function backfill(provider: "quickbooks" | "google_sheets"): Promise<SyncResult> {
  const jobKeys = await stageKeys("job");
  const unsynced =
    provider === "quickbooks" ? isNull(jobsTable.qboCustomerId) : isNull(jobsTable.sheetSyncedAt);
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(and(isNull(jobsTable.archivedAt), inArray(jobsTable.stage, jobKeys), unsynced))
    .orderBy(jobsTable.id);

  const result: SyncResult = { synced: 0, skipped: 0, failed: 0, errors: [] };
  for (const job of jobs) {
    try {
      const outcome = provider === "quickbooks" ? await pushToQuickBooks(job) : await pushToSheet(job);
      if (outcome === "synced") result.synced++;
      else result.skipped++;
      // Nothing configured — every remaining job would skip the same way.
      if (outcome === "skipped") break;
    } catch (err) {
      result.failed++;
      if (result.errors.length < 5) {
        result.errors.push(`${job.customerName}: ${err instanceof Error ? err.message : String(err)}`);
      }
      // One bad record shouldn't hide the rest, but repeated auth failures
      // would just spam the same error — stop after a handful.
      if (result.failed >= 5) break;
    }
  }
  return result;
}
