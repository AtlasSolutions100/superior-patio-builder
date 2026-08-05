/**
 * Regression tests: sales-stage leads must never leak into Job Board
 * numbers or the CSV export.
 *
 *  1. /summary byStage — pre-Sold stages (New Lead, Scheduled, Bid Given)
 *     must report zero count/contract total even when active leads exist.
 *  2. /jobs/export — the CSV must contain no rows whose Stage is
 *     New Lead, Scheduled, or Bid Given.
 *
 * The tests exercise the real route handlers (extracted from the Express
 * router, skipping the auth middleware) against the dev database with
 * temporary marker rows that are cleaned up afterwards.
 *
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db, pool, jobsTable } from "@workspace/db";
import jobsRouter from "./jobs";

const MARKER = `__leadExclusion-test-${Date.now()}`;

type Handler = (req: unknown, res: unknown) => Promise<void>;

/** The route's final handler, bypassing requireUser/requireAdmin. */
function handlerFor(method: string, path: string): Handler {
  const stack = (jobsRouter as unknown as { stack: any[] }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  assert.ok(layer, `route ${method.toUpperCase()} ${path} not found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

/** Minimal res double capturing json/send output. */
function fakeRes() {
  const captured: {
    statusCode: number;
    json: any;
    body: string | null;
    headers: Record<string, string>;
  } = { statusCode: 200, json: null, body: null, headers: {} };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.json = payload;
      return res;
    },
    send(body: string) {
      captured.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return res;
    },
    sendStatus(code: number) {
      captured.statusCode = code;
      return res;
    },
  };
  return { res, captured };
}

const createdIds: number[] = [];

async function insertJob(
  name: string,
  stage: string,
  extra: Partial<typeof jobsTable.$inferInsert> = {},
) {
  const [job] = await db
    .insert(jobsTable)
    .values({
      customerName: `${MARKER} ${name}`,
      stage: stage as any,
      ...extra,
    })
    .returning();
  createdIds.push(job.id);
  return job;
}

test.before(async () => {
  // Active leads in every pre-Sold stage, plus one real (Sold) job.
  await insertJob("lead-new", "new_lead", { contractAmount: "1000" });
  await insertJob("lead-scheduled", "scheduled", { contractAmount: "2000" });
  await insertJob("lead-bid", "bid_given", { contractAmount: "3000" });
  await insertJob("real-sold", "sold", {
    contractAmount: "4500",
    estimatedInstallDate: "2099-01-15",
  });
});

test.after(async () => {
  if (createdIds.length) {
    await db.delete(jobsTable).where(inArray(jobsTable.id, createdIds));
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// /summary — per-stage counts
// ---------------------------------------------------------------------------

test("/summary byStage reports zero for pre-Sold stages even with active leads", async () => {
  const { res, captured } = fakeRes();
  await handlerFor("get", "/summary")({}, res);

  assert.equal(captured.statusCode, 200);
  const byStage: { stage: string; count: number; contractTotal: number }[] =
    captured.json.byStage;

  for (const stage of ["new_lead", "scheduled", "bid_given"]) {
    const entry = byStage.find((s) => s.stage === stage);
    assert.ok(entry, `byStage missing ${stage}`);
    assert.equal(entry.count, 0, `${stage} count must be 0`);
    assert.equal(entry.contractTotal, 0, `${stage} contractTotal must be 0`);
  }

  // Sanity: the real Sold job we inserted IS counted.
  const sold = byStage.find((s) => s.stage === "sold");
  assert.ok(sold && sold.count >= 1, "sold stage must count real jobs");
});

// ---------------------------------------------------------------------------
// /jobs/export — CSV contents
// ---------------------------------------------------------------------------

test("/jobs/export CSV contains no New Lead / Scheduled / Bid Given rows", async () => {
  const { res, captured } = fakeRes();
  await handlerFor("get", "/jobs/export")({}, res);

  assert.equal(captured.statusCode, 200);
  assert.match(captured.headers["content-type"] ?? "", /text\/csv/);
  const csv = captured.body!;
  assert.ok(csv, "export must return a CSV body");

  const lines = csv.split("\n");
  // Stage labels are plain (never quoted/escaped), so a lead row would
  // contain the label as its own comma-delimited field.
  for (const label of ["New Lead", "Scheduled", "Bid Given"]) {
    for (const line of lines.slice(1)) {
      assert.ok(
        !line.includes(`,${label},`),
        `CSV must not contain a ${label} row: ${line}`,
      );
    }
  }

  // Our lead rows are absent; the Sold job is present.
  assert.ok(!csv.includes(`${MARKER} lead-new`), "new_lead lead leaked");
  assert.ok(!csv.includes(`${MARKER} lead-scheduled`), "scheduled lead leaked");
  assert.ok(!csv.includes(`${MARKER} lead-bid`), "bid_given lead leaked");
  assert.ok(csv.includes(`${MARKER} real-sold`), "Sold job missing from CSV");
});
