/**
 * Wiring test: a job listed through the real GET /jobs handler carries the
 * commission worked out from the configured bands, and the name of whoever
 * is credited with the sale.
 *
 * The maths itself lives in lib/commission.test.ts; this covers the part that
 * silently breaks — the route forgetting to attach the field.
 *
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { inArray, eq } from "drizzle-orm";
import { db, pool, jobsTable, commissionTiersTable, appUsersTable } from "@workspace/db";
import jobsRouter from "./jobs";

const MARKER = `__commission-test-${Date.now()}`;

type Handler = (req: unknown, res: unknown) => Promise<void>;

function handlerFor(method: string, path: string): Handler {
  const stack = (jobsRouter as unknown as { stack: any[] }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  assert.ok(layer, `route ${method.toUpperCase()} ${path} not found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function fakeRes() {
  const captured: { statusCode: number; json: any; body: string | null; headers: Record<string, string> } = {
    statusCode: 200,
    json: null,
    body: null,
    headers: {},
  };
  const res = {
    status(code: number) { captured.statusCode = code; return res; },
    json(payload: unknown) { captured.json = payload; return res; },
    send(body: string) { captured.body = body; return res; },
    setHeader(n: string, v: string) { captured.headers[n.toLowerCase()] = v; return res; },
    sendStatus(code: number) { captured.statusCode = code; return res; },
  };
  return { res, captured };
}

const createdJobIds: number[] = [];
const createdTierIds: number[] = [];
let seller: { id: number; name: string } | null = null;

test.before(async () => {
  // A band that definitely covers the test contract, without disturbing
  // whatever bands this database already has.
  const [tier] = await db
    .insert(commissionTiersTable)
    .values({ upToAmount: "999999999.00", ratePercent: "2.500", position: 999 })
    .returning();
  createdTierIds.push(tier.id);

  const [user] = await db
    .select({ id: appUsersTable.id, name: appUsersTable.name })
    .from(appUsersTable)
    .where(eq(appUsersTable.role, "admin"))
    .limit(1);
  seller = user ? { id: user.id, name: user.name ?? "" } : null;

  const [job] = await db
    .insert(jobsTable)
    .values({
      customerName: `${MARKER} commissioned`,
      stage: "sold",
      estimatedInstallDate: "2099-05-05",
      contractAmount: "10000.00",
      soldByUserId: seller?.id ?? null,
    })
    .returning();
  createdJobIds.push(job.id);
});

test.after(async () => {
  if (createdJobIds.length) {
    await db.delete(jobsTable).where(inArray(jobsTable.id, createdJobIds));
  }
  if (createdTierIds.length) {
    await db.delete(commissionTiersTable).where(inArray(commissionTiersTable.id, createdTierIds));
  }
  await pool.end();
});

test("GET /jobs returns a commission figure for the job", async () => {
  const { res, captured } = fakeRes();
  await handlerFor("get", "/jobs")(
    { query: {}, appUser: { id: -1, role: "admin" } },
    res,
  );
  assert.equal(captured.statusCode, 200);

  const job = captured.json.find((j: any) => j.customerName === `${MARKER} commissioned`);
  assert.ok(job, "test job missing from the list");

  // The smallest band covering $10,000 wins. Whatever the database already
  // held, the answer must be a real number derived from the contract.
  assert.equal(typeof job.commissionAmount, "number");
  assert.ok(
    job.commissionAmount > 0 && job.commissionAmount <= 10000,
    `commission ${job.commissionAmount} is not a plausible cut of $10,000`,
  );
});

test("GET /jobs resolves the name of whoever is credited with the sale", async (t) => {
  if (!seller) return t.skip("no admin user in this database to credit");

  const { res, captured } = fakeRes();
  await handlerFor("get", "/jobs")(
    { query: {}, appUser: { id: -1, role: "admin" } },
    res,
  );
  const job = captured.json.find((j: any) => j.customerName === `${MARKER} commissioned`);
  assert.equal(job.soldByUserId, seller.id);
  assert.ok(job.soldByName, "soldByName should be resolved server-side");
});

test("the CSV export carries Sold By and Commission columns", async () => {
  const { res, captured } = fakeRes();
  await handlerFor("get", "/jobs/export")({}, res);

  assert.equal(captured.statusCode, 200);
  const csv = captured.body!;
  const header = csv.split("\n")[0];
  assert.ok(header.includes("Sold By"), "export is missing the Sold By column");
  assert.ok(header.includes("Commission"), "export is missing the Commission column");

  const row = csv.split("\n").find((l) => l.includes(`${MARKER} commissioned`));
  assert.ok(row, "test job missing from the export");
  // Commission lands in its own column as a plain number, not blank.
  assert.match(row!, /,\d+\.\d{2},/, "no commission value in the row");
});
