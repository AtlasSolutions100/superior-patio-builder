/**
 * Stage management contract:
 *
 *  1. Creating a stage generates a unique key, appends it to its pipeline
 *     (or after `afterKey`), and rejects duplicate labels.
 *  2. Removing a stage that still holds jobs requires `moveTo` and moves
 *     those jobs (active AND archived) in the same transaction.
 *  3. Re-adding a removed stage revives the same key, so job history and
 *     old CSVs keep resolving to a label.
 *  4. The install-date gate is a pipeline boundary: moving a job into any
 *     job-pipeline stage without a date is a 400 — including brand-new
 *     custom stages that never existed when the rule was written.
 *
 * Runs against the dev database via the real route handlers (auth skipped).
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool, jobsTable, stagesTable } from "@workspace/db";
import stagesRouter from "./stages";
import jobsRouter from "./jobs";
import { invalidateStages } from "../lib/stages";

const MARKER = `__stages-test-${Date.now()}`;

type Handler = (req: unknown, res: unknown) => Promise<void>;

function handlerFor(router: unknown, method: string, path: string): Handler {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  assert.ok(layer, `route ${method.toUpperCase()} ${path} not found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function fakeRes() {
  const captured: { statusCode: number; json: any } = {
    statusCode: 200,
    json: null,
  };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.json = payload;
      return res;
    },
    end() {
      return res;
    },
    sendStatus(code: number) {
      captured.statusCode = code;
      return res;
    },
  };
  return { res, captured };
}

const adminReq = (over: Record<string, unknown> = {}) => ({
  appUser: { id: -1, role: "admin", name: "Test Admin" },
  ...over,
});

const createdJobIds: number[] = [];
const createdStageIds: number[] = [];

async function createStage(body: Record<string, unknown>) {
  const { res, captured } = fakeRes();
  await handlerFor(stagesRouter, "post", "/stages")(adminReq({ body }), res);
  if (captured.json?.id) createdStageIds.push(captured.json.id);
  return captured;
}

test.after(async () => {
  if (createdJobIds.length) {
    await db.delete(jobsTable).where(inArray(jobsTable.id, createdJobIds));
  }
  if (createdStageIds.length) {
    await db.delete(stagesTable).where(inArray(stagesTable.id, createdStageIds));
  }
  invalidateStages();
  await pool.end();
});

// ---------------------------------------------------------------------------

test("create appends to the pipeline with a slug key; duplicate labels rejected", async () => {
  const label = `${MARKER} Waiting For Delivery`;
  const created = await createStage({ label, pipeline: "job" });
  assert.equal(created.statusCode, 201);
  assert.match(created.json.key, /waiting_for_delivery/);
  assert.equal(created.json.pipeline, "job");

  // Appended after every existing job stage.
  const { res, captured } = fakeRes();
  await handlerFor(stagesRouter, "get", "/stages")(adminReq(), res);
  const jobStages = captured.json.filter((s: any) => s.pipeline === "job");
  assert.equal(jobStages[jobStages.length - 1].key, created.json.key);

  const dup = await createStage({ label: label.toUpperCase(), pipeline: "job" });
  assert.equal(dup.statusCode, 400, "case-insensitive duplicate label must 400");
});

test("afterKey inserts in the middle and renumbers", async () => {
  const a = await createStage({ label: `${MARKER} A`, pipeline: "job" });
  const b = await createStage({
    label: `${MARKER} B`,
    pipeline: "job",
    afterKey: "sold",
  });
  assert.equal(b.statusCode, 201);

  const { res, captured } = fakeRes();
  await handlerFor(stagesRouter, "get", "/stages")(adminReq(), res);
  const keys = captured.json
    .filter((s: any) => s.pipeline === "job")
    .map((s: any) => s.key);
  assert.equal(keys[keys.indexOf("sold") + 1], b.json.key, "B sits right after sold");
  // Positions stay a clean 1..n sequence.
  const positions = captured.json
    .filter((s: any) => s.pipeline === "job")
    .map((s: any) => s.position);
  assert.deepEqual(positions, positions.map((_: number, i: number) => i + 1));
  assert.ok(a.json.key !== b.json.key);
});

test("remove with jobs requires moveTo, then moves jobs and revives on re-add", async () => {
  const doomed = await createStage({ label: `${MARKER} Doomed`, pipeline: "job" });
  assert.equal(doomed.statusCode, 201);

  const [job] = await db
    .insert(jobsTable)
    .values({
      customerName: `${MARKER} occupant`,
      stage: doomed.json.key,
      estimatedInstallDate: "2099-06-01",
    })
    .returning();
  createdJobIds.push(job.id);

  // No moveTo -> 400 with the job count.
  {
    const { res, captured } = fakeRes();
    await handlerFor(stagesRouter, "post", "/stages/:id/remove")(
      adminReq({ params: { id: String(doomed.json.id) }, body: {} }),
      res,
    );
    assert.equal(captured.statusCode, 400);
    assert.equal(captured.json.jobCount, 1);
  }

  // moveTo in another pipeline -> 400.
  {
    const { res, captured } = fakeRes();
    await handlerFor(stagesRouter, "post", "/stages/:id/remove")(
      adminReq({ params: { id: String(doomed.json.id) }, body: { moveTo: "new_lead" } }),
      res,
    );
    assert.equal(captured.statusCode, 400, "cross-pipeline moveTo must 400");
  }

  // Valid moveTo -> 204, job moved, stage archived.
  {
    const { res, captured } = fakeRes();
    await handlerFor(stagesRouter, "post", "/stages/:id/remove")(
      adminReq({ params: { id: String(doomed.json.id) }, body: { moveTo: "sold" } }),
      res,
    );
    assert.equal(captured.statusCode, 204);
  }
  const [moved] = await db.select().from(jobsTable).where(eq(jobsTable.id, job.id));
  assert.equal(moved.stage, "sold", "job reassigned to moveTo stage");
  const [gone] = await db
    .select()
    .from(stagesTable)
    .where(eq(stagesTable.id, doomed.json.id));
  assert.ok(gone.archivedAt, "stage soft-archived, not deleted");

  // Re-adding the same label revives the same key.
  const revived = await createStage({ label: `${MARKER} Doomed`, pipeline: "job" });
  assert.equal(revived.statusCode, 201);
  assert.equal(revived.json.key, doomed.json.key, "revived stage keeps its key");
  assert.equal(revived.json.id, doomed.json.id);
});

test("install-date gate applies to brand-new job stages too", async () => {
  const custom = await createStage({ label: `${MARKER} Footings QA`, pipeline: "job" });
  assert.equal(custom.statusCode, 201);

  const [lead] = await db
    .insert(jobsTable)
    .values({ customerName: `${MARKER} dateless lead`, stage: "new_lead" })
    .returning();
  createdJobIds.push(lead.id);

  const { res, captured } = fakeRes();
  await handlerFor(jobsRouter, "patch", "/jobs/:id/stage")(
    adminReq({
      params: { id: String(lead.id) },
      body: { stage: custom.json.key },
    }),
    res,
  );
  assert.equal(captured.statusCode, 400, "moving into a job stage without a date must 400");
  assert.match(captured.json.error, /Estimated Installation Date/);
});
