/**
 * Clears development/demo records before the client starts using the app.
 *
 *   pnpm --filter @workspace/scripts run purge:demo                 (dry run)
 *   pnpm --filter @workspace/scripts run purge:demo -- --confirm
 *
 * Removes: every job and lead (with their notes and assignments) and
 * submitted feedback.
 *
 * Keeps: stages, team members, invites, lead sources, and — importantly —
 * the lead-import ledger, so historical sheet rows are NOT re-imported on the
 * next sync. Without that, clearing the ledger makes the importer treat every
 * row in the sheet as new and the leads you just deleted come straight back.
 *
 * Pass --reset-ledger to clear the ledger too. That is a development-only
 * option: the next sync will re-import every row the sheet has ever held.
 */
import { sql } from "drizzle-orm";
import { assertDemoSafeDatabase } from "./demo-guard";

// Fail closed BEFORE the database client is even loaded: this purge is
// development-only and must never run against a live customer database.
assertDemoSafeDatabase();

const { db, pool } = await import("@workspace/db");

const confirm = process.argv.includes("--confirm");
const resetLedger = process.argv.includes("--reset-ledger");

async function counts() {
  const q = async (t: string) => {
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`);
    return rows[0].n;
  };
  return {
    jobs: await q("jobs"),
    job_notes: await q("job_notes"),
    job_assignments: await q("job_assignments"),
    lead_imports: await q("lead_imports"),
    feedback: await q("feedback"),
    // kept:
    stages: await q("stages"),
    app_users: await q("app_users"),
    lead_sources: await q("lead_sources"),
  };
}

async function main(): Promise<void> {
  const before = await counts();
  console.log("Current contents:");
  console.table(before);

  const ledgerLine = resetLedger
    ? `Would ALSO clear the ${before.lead_imports}-row import ledger — the next ` +
      `sync would re-import every row in each enabled sheet.\n`
    : `Would keep the ${before.lead_imports}-row import ledger, so those sheet ` +
      `rows stay gone (only new rows import).\n`;

  if (!confirm) {
    console.log(
      `\nDRY RUN — nothing was deleted.\n` +
        `Would delete ${before.jobs} jobs/leads, ${before.job_notes} notes, ` +
        `${before.job_assignments} assignments, and ${before.feedback} feedback entries.\n` +
        ledgerLine +
        `Would keep ${before.stages} stages, ${before.app_users} team members, ` +
        `${before.lead_sources} lead sheets.\n\n` +
        `Re-run with --confirm to actually delete.`,
    );
    return;
  }

  await db.transaction(async (tx) => {
    // job_notes and job_assignments cascade from jobs, but be explicit so the
    // counts below are honest even if the FKs ever change.
    await tx.execute(sql`DELETE FROM job_assignments`);
    await tx.execute(sql`DELETE FROM job_notes`);
    await tx.execute(sql`DELETE FROM feedback`);
    if (resetLedger) {
      await tx.execute(sql`DELETE FROM lead_imports`);
    } else {
      // Keep the dedupe keys, but drop the link to the rows being deleted.
      await tx.execute(sql`UPDATE lead_imports SET job_id = NULL`);
    }
    await tx.execute(sql`DELETE FROM jobs`);
  });

  console.log("\nAfter purge:");
  console.table(await counts());
  console.log(
    "\nDone. Stages, team members, invites, and lead sheets were kept.\n" +
      (resetLedger
        ? "The import ledger was CLEARED — the next sync will re-import every row in each enabled sheet."
        : "The import ledger was kept, so previously imported sheet rows will not come back; only new rows import."),
  );
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
