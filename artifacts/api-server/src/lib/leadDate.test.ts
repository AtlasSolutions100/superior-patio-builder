/**
 * Regression tests for the leadDate ("came in" date) computation.
 *
 * Runs the real SQL expression against the dev database with temporary rows,
 * so a regression in the regex, the timestamptz cast, the created-at
 * fallback, or the correlated-column qualification fails loudly here.
 *
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, pool, jobsTable, leadImportsTable } from "@workspace/db";
import { leadDateSql } from "./leadDate";

const MARKER = `__leadDate-test-${Date.now()}`;

async function insertJob(name: string, createdAt?: Date) {
  const [job] = await db
    .insert(jobsTable)
    .values({
      customerName: `${MARKER} ${name}`,
      stage: "new_lead",
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  return job;
}

async function insertLedger(jobId: number, dedupeKey: string) {
  await db.insert(leadImportsTable).values({ jobId, dedupeKey });
}

/** Select the computed leadDate for one job, exactly like the list route. */
async function leadDateFor(jobId: number): Promise<Date> {
  const [row] = await db
    .select({ leadDate: leadDateSql })
    .from(jobsTable)
    .where(eq(jobsTable.id, jobId));
  assert.ok(row, `job ${jobId} not found`);
  assert.ok(row.leadDate != null, "leadDate must never be null");
  return new Date(row.leadDate);
}

const createdIds: number[] = [];

test.after(async () => {
  if (createdIds.length) {
    await db
      .delete(leadImportsTable)
      .where(inArray(leadImportsTable.jobId, createdIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, createdIds));
  }
  await pool.end();
});

test("imported lead with a valid sheet date uses the ledger date, not created-at", async () => {
  const job = await insertJob("valid-key");
  createdIds.push(job.id);
  await insertLedger(job.id, `2026-03-05 14:30:00|5551234567|${MARKER}`);

  const d = await leadDateFor(job.id);
  assert.notEqual(
    d.getTime(),
    job.createdAt.getTime(),
    "must not fall back to created-at when the ledger has a valid date",
  );
  // The sheet timestamp is interpreted in the DB session timezone; compare
  // against the same cast to stay timezone-correct.
  const [{ expected }] = await db.execute<{ expected: Date }>(
    sql`SELECT '2026-03-05 14:30:00'::timestamptz AS expected`,
  ).then(r => r.rows);
  assert.equal(d.toISOString(), new Date(expected).toISOString());
});

test("date-only ledger key (no time part) is accepted", async () => {
  const job = await insertJob("date-only-key");
  createdIds.push(job.id);
  await insertLedger(job.id, `2026-04-10|5550001111|${MARKER}`);

  const d = await leadDateFor(job.id);
  assert.notEqual(d.getTime(), job.createdAt.getTime());
});

test("malformed/garbage ledger key falls back to created-at", async () => {
  const cases: [string, string][] = [
    ["garbage", `not-a-date|5550002222|${MARKER}`],
    ["bad-month", `2026-13-40 99:99:99|5550003333|${MARKER}`], // regex-shaped but invalid timestamptz
    ["empty-first-field", `|5550004444|${MARKER}`],
  ];
  for (const [label, key] of cases) {
    const job = await insertJob(`malformed-${label}`);
    createdIds.push(job.id);
    await insertLedger(job.id, key);
    const d = await leadDateFor(job.id);
    assert.equal(
      d.toISOString(),
      job.createdAt.toISOString(),
      `${label}: must fall back to created-at`,
    );
  }
});

test("manual lead with no ledger row falls back to created-at", async () => {
  const job = await insertJob("manual");
  createdIds.push(job.id);
  const d = await leadDateFor(job.id);
  assert.equal(d.toISOString(), job.createdAt.toISOString());
});

test("correlated subquery binds to the OUTER job id — each job gets its own date", async () => {
  // If "jobs"."id" ever regresses to an unqualified/mis-bound column, the
  // subquery matches the wrong (or an arbitrary) ledger row and these two
  // jobs would report identical or swapped dates.
  const jobA = await insertJob("pair-a");
  const jobB = await insertJob("pair-b");
  createdIds.push(jobA.id, jobB.id);
  await insertLedger(jobA.id, `2026-01-01 08:00:00|5551110000|${MARKER}`);
  await insertLedger(jobB.id, `2026-06-15 09:00:00|5552220000|${MARKER}`);

  const dA = await leadDateFor(jobA.id);
  const dB = await leadDateFor(jobB.id);
  assert.equal(dA.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(dB.toISOString().slice(0, 10), "2026-06-15");
});

test("date-range boundary days: on-boundary leads are included, outside excluded", async () => {
  // Mirrors the UI's "Came in" filter semantics: a from/to day range must
  // include leads whose came-in date falls exactly ON the boundary days.
  const first = await insertJob("boundary-first"); // first day, start of day
  const last = await insertJob("boundary-last"); // last day, end of day
  const before = await insertJob("boundary-before");
  const after = await insertJob("boundary-after");
  createdIds.push(first.id, last.id, before.id, after.id);
  await insertLedger(first.id, `2026-02-10 00:00:00|5553330000|${MARKER}`);
  await insertLedger(last.id, `2026-02-20 23:59:59|5554440000|${MARKER}`);
  await insertLedger(before.id, `2026-02-09 23:59:59|5555550000|${MARKER}`);
  await insertLedger(after.id, `2026-02-21 00:00:00|5556660000|${MARKER}`);

  const rows = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        inArray(jobsTable.id, [first.id, last.id, before.id, after.id]),
        gte(sql`(${leadDateSql})::date`, sql`'2026-02-10'::date`),
        lte(sql`(${leadDateSql})::date`, sql`'2026-02-20'::date`),
      ),
    );
  const ids = rows.map(r => r.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [first.id, last.id].sort((a, b) => a - b));
});
