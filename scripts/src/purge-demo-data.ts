/**
 * Clears development/demo records before the client starts using the app.
 *
 *   pnpm --filter @workspace/scripts run purge:demo -- --dry-run   (default)
 *   pnpm --filter @workspace/scripts run purge:demo -- --confirm
 *
 * Removes: every job (with its notes and assignments), the lead-import
 * ledger, and submitted feedback.
 * Keeps: stages, team members, invites, and lead sources — the app's
 * configuration, which you want to survive into production.
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const confirm = process.argv.includes("--confirm");

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

  if (!confirm) {
    console.log(
      `\nDRY RUN — nothing was deleted.\n` +
        `Would delete ${before.jobs} jobs, ${before.job_notes} notes, ` +
        `${before.job_assignments} assignments, ${before.lead_imports} import-ledger rows, ` +
        `and ${before.feedback} feedback entries.\n` +
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
    await tx.execute(sql`DELETE FROM lead_imports`);
    await tx.execute(sql`DELETE FROM feedback`);
    await tx.execute(sql`DELETE FROM jobs`);
  });

  console.log("\nAfter purge:");
  console.table(await counts());
  console.log(
    "\nDone. Stages, team members, invites, and lead sheets were kept.\n" +
      "Next sync will re-import leads from any enabled lead sheet — disable or " +
      "remove sheets first if you do not want that.",
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
