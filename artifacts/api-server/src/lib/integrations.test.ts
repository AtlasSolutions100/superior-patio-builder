/**
 * Integration plumbing contract (no network — fetch is stubbed):
 *
 *  1. QuickBooks: the authorize URL carries exactly the accounting scope and
 *     our redirect; a refresh persists the ROTATED refresh token before any
 *     API call is made; customer payloads only include what the job has.
 *  2. Google Sheets: the JWT assertion verifies against the service account's
 *     own public key with the right claims; sheet URLs and bare ids both
 *     resolve; a job becomes the documented row shape.
 *  3. Status route never leaks tokens.
 *
 * Runs against the dev database. Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, integrationsTable, type Job } from "@workspace/db";
import * as qbo from "./quickbooks";
import * as sheets from "./googleSheets";
import integrationsRouter from "../routes/integrations";

const env: qbo.QboEnv = {
  clientId: "client-id",
  clientSecret: "client-secret",
  environment: "sandbox",
  redirectUri: "https://example.test/api/integrations/quickbooks/callback",
};

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});
test.after(async () => {
  await db.delete(integrationsTable).where(eq(integrationsTable.provider, "quickbooks"));
  await pool.end();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---------------------------------------------------------------------------
// QuickBooks
// ---------------------------------------------------------------------------
test("qbo: authorize URL has the accounting scope, redirect and state", () => {
  const url = new URL(qbo.authorizeUrl(env, "abc123"));
  assert.equal(url.origin + url.pathname, "https://appcenter.intuit.com/connect/oauth2");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(url.searchParams.get("redirect_uri"), env.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "abc123");
});

test("qbo: state is single-use and bound to the admin who started it", () => {
  const state = qbo.newState(42);
  assert.equal(qbo.consumeState(state), 42);
  assert.equal(qbo.consumeState(state), null, "replay must be rejected");
  assert.equal(qbo.consumeState("never-issued"), null);
});

test("qbo: qboEnv is null until all three settings exist; production host switches", () => {
  assert.equal(qbo.qboEnv({}), null);
  assert.equal(qbo.qboEnv({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b" }), null);
  const e = qbo.qboEnv({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_REDIRECT_URI: "c", QBO_ENVIRONMENT: "production" });
  assert.equal(e?.environment, "production");
  assert.equal(qbo.apiBase("production"), "https://quickbooks.api.intuit.com");
  assert.equal(qbo.apiBase("sandbox"), "https://sandbox-quickbooks.api.intuit.com");
});

test("qbo: an expired access token is refreshed and the rotated refresh token is saved first", async () => {
  await db.delete(integrationsTable).where(eq(integrationsTable.provider, "quickbooks"));
  await qbo.saveTokens(
    { access_token: "old-access", refresh_token: "old-refresh", expires_in: 3600 },
    { realmId: "9130", connectedAt: new Date() },
  );
  // saveTokens floors the lifetime at a minute, so expire it by hand.
  await db
    .update(integrationsTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(integrationsTable.provider, "quickbooks"));

  const calls: { url: string; body: string; auth: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: String(init?.body ?? ""),
      auth: String((init?.headers as Record<string, string>)?.Authorization ?? ""),
    });
    if (url.includes("/tokens/bearer")) {
      return jsonResponse({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
    }
    // The API call the refresh was for.
    return jsonResponse({ QueryResponse: { Customer: [{ Id: "77" }] } });
  }) as typeof fetch;

  const id = await qbo.findCustomerByName(env, "O'Brien Family");
  assert.equal(id, "77");

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /tokens\/bearer$/);
  assert.match(calls[0].body, /grant_type=refresh_token/);
  assert.match(calls[0].body, /refresh_token=old-refresh/);
  assert.equal(calls[0].auth, `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
  assert.equal(calls[1].auth, "Bearer new-access");
  assert.match(calls[1].url, /^https:\/\/sandbox-quickbooks\.api\.intuit\.com\/v3\/company\/9130\/query\?query=/);
  // Single quotes in the name are doubled for QBO's query language.
  assert.ok(decodeURIComponent(calls[1].url).includes("DisplayName = 'O''Brien Family'"));

  const conn = await qbo.getConnection();
  assert.equal(conn?.refreshToken, "new-refresh", "rotated refresh token must be persisted");
  assert.equal(conn?.accessToken, "new-access");
  assert.equal(conn?.realmId, "9130", "refresh must not lose the company id");
});

test("qbo: a rejected refresh token disconnects the app and asks for a reconnect", async () => {
  await qbo.saveTokens(
    { access_token: "dead-access", refresh_token: "dead-refresh", expires_in: 3600 },
    { realmId: "9130" },
  );
  await db
    .update(integrationsTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(integrationsTable.provider, "quickbooks"));
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token invalid" }), {
      status: 400,
      headers: { "Content-Type": "application/json", intuit_tid: "tid-123" },
    })) as typeof fetch;

  await assert.rejects(
    () => qbo.findCustomerByName(env, "Anyone"),
    (err: unknown) => {
      assert.ok(err instanceof qbo.QboError);
      assert.equal(err.code, "invalid_grant");
      assert.equal(err.intuitTid, "tid-123");
      assert.match(err.message, /intuit_tid tid-123/);
      return true;
    },
  );
  const conn = await qbo.getConnection();
  assert.equal(conn?.refreshToken, null, "dead tokens must be forgotten");
  assert.equal(conn?.realmId, "9130", "company id is kept for the reconnect");
  assert.match(conn?.lastError ?? "", /reconnect/i);
});

test("qbo: a still-valid access token is reused without a refresh", async () => {
  await qbo.saveTokens(
    { access_token: "live-access", refresh_token: "live-refresh", expires_in: 3600 },
    { realmId: "9130" },
  );
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return jsonResponse({ Customer: { Id: "88" } });
  }) as typeof fetch;

  const id = await qbo.createCustomer(env, {
    customerName: "Sarah Nguyen",
    phone: null,
    address: null,
    city: null,
    coverType: null,
  } as Job);
  assert.equal(id, "88");
  assert.equal(urls.length, 1);
  assert.doesNotMatch(urls[0], /tokens\/bearer/);
});

test("qbo: customer payload carries only what the job has", () => {
  assert.deepEqual(
    qbo.customerPayload({ customerName: "  Sarah Nguyen ", phone: null, address: null, city: null, coverType: null }),
    { DisplayName: "Sarah Nguyen" },
  );
  assert.deepEqual(
    qbo.customerPayload({
      customerName: "Tom Reyes",
      phone: "801-555-0100",
      address: "12 Elm St",
      city: "Draper",
      coverType: "Solid Alumawood",
    }),
    {
      DisplayName: "Tom Reyes",
      PrimaryPhone: { FreeFormNumber: "801-555-0100" },
      BillAddr: { Line1: "12 Elm St", City: "Draper" },
      Notes: "Job: Solid Alumawood",
    },
  );
});

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
test("sheets: assertion is RS256-signed by the service account with the right claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa: sheets.ServiceAccount = {
    client_email: "bot@project.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    token_uri: "https://oauth2.googleapis.com/token",
  };
  const jwt = sheets.signedAssertion(sa, 1_700_000_000);
  const [h, c, s] = jwt.split(".");
  const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  assert.deepEqual(decode(h), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decode(c), {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: sa.token_uri,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${c}`);
  assert.ok(verifier.verify(publicKey, Buffer.from(s, "base64url")), "signature must verify");
});

test("sheets: service account loads from base64 and rejects junk", () => {
  const json = JSON.stringify({ client_email: "bot@p.iam.gserviceaccount.com", private_key: "-----BEGIN" });
  const sa = sheets.serviceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON_B64: Buffer.from(json).toString("base64") });
  assert.equal(sa?.client_email, "bot@p.iam.gserviceaccount.com");
  assert.equal(sa?.token_uri, "https://oauth2.googleapis.com/token");
  assert.equal(sheets.serviceAccount({}), null);
  assert.equal(sheets.serviceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON: "not json" }), null);
  assert.equal(sheets.serviceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON: "{}" }), null);
});

test("sheets: spreadsheet id from a URL, a bare id, or nothing", () => {
  const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
  assert.equal(sheets.spreadsheetIdFrom(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(sheets.spreadsheetIdFrom(`  ${id}  `), id);
  assert.equal(sheets.spreadsheetIdFrom("https://docs.google.com/document/d/abc/edit"), null);
  assert.equal(sheets.spreadsheetIdFrom("short"), null);
  assert.equal(sheets.spreadsheetIdFrom(""), null);
});

test("sheets: a job becomes the documented row, in header order", () => {
  const row = sheets.jobToRow(
    {
      id: 5,
      customerName: "Tom Reyes",
      phone: "801-555-0100",
      address: "12 Elm St",
      city: "Draper",
      coverType: "Solid Alumawood",
      contractAmount: "18500.00",
      estimatedInstallDate: "2026-10-14",
    } as unknown as Job,
    { soldByName: "Justin", commissionAmount: 555, stageLabel: "Scheduled", dateSold: new Date("2026-09-25T18:00:00Z") },
  );
  assert.equal(row.length, sheets.ROW_HEADER.length);
  assert.deepEqual(row, [
    "2026-09-25",
    "Tom Reyes",
    "801-555-0100",
    "12 Elm St",
    "Draper",
    "Solid Alumawood",
    18500,
    "Justin",
    555,
    "2026-10-14",
    "Scheduled",
    5,
  ]);
  assert.equal(sheets.a1Tab("Job Board"), "'Job Board'");
  assert.equal(sheets.a1Tab("Justin's"), "'Justin''s'");
});

// ---------------------------------------------------------------------------
// Status route
// ---------------------------------------------------------------------------
test("status route reports connection state and never returns tokens", async () => {
  await qbo.saveTokens(
    { access_token: "secret-access", refresh_token: "secret-refresh", expires_in: 3600 },
    { realmId: "9130", externalName: "Superior Patio Covers" },
  );
  const stack = (integrationsRouter as unknown as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === "/integrations" && l.route?.methods?.get);
  assert.ok(layer);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  let payload: any = null;
  await handler({ headers: {} }, { json: (p: unknown) => (payload = p) });

  assert.equal(payload.quickbooks.connected, true);
  assert.equal(payload.quickbooks.companyName, "Superior Patio Covers");
  assert.equal(typeof payload.googleSheets.sheetName, "string");
  const dump = JSON.stringify(payload);
  assert.ok(!dump.includes("secret-access") && !dump.includes("secret-refresh"), "tokens must never be exposed");
});
