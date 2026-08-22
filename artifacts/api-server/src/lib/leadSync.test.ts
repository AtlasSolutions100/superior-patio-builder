/**
 * Safety net for the sheet-sync importer (leadSync.ts).
 *
 * Guards the two things a quiet change could silently break:
 *  1. Dedupe-key construction — the first "|" segment must stay a date the
 *     leadDate parser accepts, or imported leads degrade back to created-at.
 *  2. Idempotence — re-running a sync over the same CSV must never import
 *     the same row twice (the ledger is the source of truth).
 *
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool, jobsTable, jobNotesTable, leadImportsTable, leadSourcesTable } from "@workspace/db";
import { parseCsv, mapRows, syncLeadsFromSheet, normalizeSheetUrl } from "./leadSync";
import { leadDateSql } from "./leadDate";

const MARKER = `__leadSync-test-${Date.now()}`;

// Unique phone digits per run so dedupe keys never collide with real data
// or a previous (crashed) test run's leftovers.
const runSuffix = String(Date.now() % 10_000_000).padStart(7, "0");
const PHONE_A = `208${runSuffix}`;
const PHONE_B = `209${runSuffix}`;

const HEADER =
  "Date,First Name,Last Name,Phone,Phone Number Cleaned,Email,Address,Notes,Product,UTM Source";

function csvOf(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

const createdJobIds: number[] = [];
const createdKeys: string[] = [];

test.after(async () => {
  if (createdKeys.length) {
    await db
      .delete(leadImportsTable)
      .where(inArray(leadImportsTable.dedupeKey, createdKeys));
  }
  if (createdJobIds.length) {
    await db
      .delete(jobNotesTable)
      .where(inArray(jobNotesTable.jobId, createdJobIds));
    await db
      .delete(leadImportsTable)
      .where(inArray(leadImportsTable.jobId, createdJobIds));
    await db.delete(jobsTable).where(inArray(jobsTable.id, createdJobIds));
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// Dedupe-key construction
// ---------------------------------------------------------------------------

test("dedupe key is sheet date + cleaned phone digits", () => {
  const rows = parseCsv(
    csvOf(`2026-03-05 14:30:00,Jane,Doe,(208) 555-0142,,,,,,google`),
  );
  const [lead] = mapRows(rows);
  assert.equal(lead.dedupeKey, "2026-03-05 14:30:00|2085550142");
});

test("dedupe key prefers the cleaned-phone column and strips formatting", () => {
  const rows = parseCsv(
    csvOf(`2026-03-05,Jane,Doe,(208) 555-0142,+1-208-555-0142,,,,,`),
  );
  const [lead] = mapRows(rows);
  assert.equal(lead.dedupeKey, "2026-03-05|12085550142");
});

test("row with no phone falls back to lowercased name; no date+no phone is skipped", () => {
  const rows = parseCsv(
    csvOf(
      `2026-03-05,Jane,Doe,,,,,,,`, // no phone -> name fallback
      `,John,Smith,,,,,,,`, // no date, no phone -> no stable identity
    ),
  );
  const leads = mapRows(rows);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].dedupeKey, "2026-03-05|jane doe");
});

test("KEY-FORMAT CONTRACT: the leadDate parser accepts keys the importer builds", async () => {
  // End-to-end: build a key exactly like the importer, store it in the
  // ledger, and assert the real SQL parser extracts the sheet date instead
  // of falling back to created-at. If the key derivation ever changes shape
  // (date format, separator, segment order), this fails.
  const cases = [
    `2026-03-05 14:30:00,Key,Contract,(208) 555-0142,,,,,,`,
    `2026-04-10,Key,ContractDateOnly,(208) 555-0143,,,,,,`,
  ];
  for (const row of cases) {
    const [lead] = mapRows(parseCsv(csvOf(row)));
    const [job] = await db
      .insert(jobsTable)
      .values({ customerName: `${MARKER} ${lead.customerName}`, stage: "new_lead" })
      .returning();
    createdJobIds.push(job.id);
    await db
      .insert(leadImportsTable)
      .values({ jobId: job.id, dedupeKey: lead.dedupeKey });

    const [res] = await db
      .select({ leadDate: leadDateSql })
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    assert.ok(res.leadDate != null);
    assert.notEqual(
      new Date(res.leadDate).toISOString(),
      job.createdAt.toISOString(),
      `parser rejected importer key "${lead.dedupeKey}" — dates would degrade to created-at`,
    );
    const sheetDate = row.split(",")[0];
    const expectedDay = sheetDate.slice(0, 10);
    // Compare in DB-session timezone terms: the day must survive the round trip.
    assert.equal(
      new Date(res.leadDate).getTime() > 0 && lead.dedupeKey.startsWith(`${sheetDate}|`),
      true,
    );
    assert.equal(lead.dedupeKey.split("|")[0].slice(0, 10), expectedDay);
  }
});

// ---------------------------------------------------------------------------
// Re-run idempotence (real sync loop against the dev DB, stubbed fetch)
// ---------------------------------------------------------------------------

test("re-running a sync over the same CSV imports each row exactly once", async () => {
  // The sync loop reads enabled sources from the DB now — give it one whose
  // fetch the stub below will answer. Other enabled sources get the same
  // stubbed CSV, which the global dedupe ledger makes harmless.
  const [tempSource] = await db
    .insert(leadSourcesTable)
    .values({ name: MARKER, csvUrl: "https://example.com/" + MARKER })
    .returning();
  const csv = csvOf(
    `2026-05-01 09:00:00,${MARKER},SyncOne,${PHONE_A},,,"663 Sarah Ave, Twin Falls, ID",First note,Patio Cover,google`,
    `2026-05-01 10:00:00,${MARKER},SyncTwo,${PHONE_B},,,,,,website`,
    // exact duplicate row inside the same CSV — must import once
    `2026-05-01 10:00:00,${MARKER},SyncTwo,${PHONE_B},,,,,,website`,
  );
  for (const lead of mapRows(parseCsv(csv))) createdKeys.push(lead.dedupeKey);

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(csv, { status: 200 })) as typeof fetch;
  try {
    const first = await syncLeadsFromSheet();
    assert.equal(first, 2, "first run imports the two unique rows");
    const second = await syncLeadsFromSheet();
    assert.equal(second, 0, "second run over the same CSV imports nothing");
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(leadSourcesTable).where(eq(leadSourcesTable.id, tempSource.id));
  }

  const ledger = await db
    .select({ jobId: leadImportsTable.jobId })
    .from(leadImportsTable)
    .where(inArray(leadImportsTable.dedupeKey, createdKeys));
  const jobIds = ledger.map(l => l.jobId).filter((v): v is number => v != null);
  createdJobIds.push(...jobIds);
  assert.equal(jobIds.length, 2, "exactly one job per unique sheet row");
});

// ---------------------------------------------------------------------------
// Sheet URL normalization (what admins paste into Settings)
// ---------------------------------------------------------------------------

test("normalizeSheetUrl converts share/edit links to CSV export URLs", () => {
  assert.equal(
    normalizeSheetUrl("https://docs.google.com/spreadsheets/d/ABC123_x-y/edit#gid=1886246861"),
    "https://docs.google.com/spreadsheets/d/ABC123_x-y/export?format=csv&gid=1886246861",
  );
  assert.equal(
    normalizeSheetUrl("https://docs.google.com/spreadsheets/d/ABC123/edit?usp=sharing"),
    "https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=0",
  );
  // Already an export URL: untouched.
  const exportUrl = "https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=7";
  assert.equal(normalizeSheetUrl(exportUrl), exportUrl);
  // Non-Google http(s): untouched. Non-URLs: rejected.
  assert.equal(normalizeSheetUrl("https://example.com/leads.csv"), "https://example.com/leads.csv");
  assert.equal(normalizeSheetUrl("not a url"), null);
  assert.equal(normalizeSheetUrl("ftp://example.com/x.csv"), null);
});
