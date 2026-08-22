import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDemoSafeDatabase, DemoGuardError } from "./demo-guard";

const LOCAL_URL = "postgresql://user:pw@localhost:5432/appdb";
const REMOTE_URL = "postgresql://user:pw@db.some-cloud.example.com:5432/appdb";

function blocked(env: Record<string, string | undefined>, pattern: RegExp) {
  assert.throws(
    () => assertDemoSafeDatabase(env),
    (err: unknown) => err instanceof DemoGuardError && pattern.test((err as Error).message),
  );
}

test("blocks when DATABASE_URL is missing", () => {
  blocked({}, /DATABASE_URL is not set/);
  blocked({ NODE_ENV: "development" }, /DATABASE_URL is not set/);
});

test("blocks Replit deployments even with every other signal present", () => {
  blocked(
    {
      DATABASE_URL: LOCAL_URL,
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "x.replit.dev",
      ALLOW_DEMO_DB_HOST: "localhost",
    },
    /Replit deployment/,
  );
});

test("blocks NODE_ENV=production even against a local database", () => {
  blocked(
    { DATABASE_URL: LOCAL_URL, NODE_ENV: "production", ALLOW_DEMO_DB_HOST: "localhost" },
    /NODE_ENV=production/,
  );
});

test("blocks production-marked database URLs, regardless of other signals", () => {
  for (const url of [
    "postgresql://u:p@localhost/app_prod",
    "postgresql://u:p@prod-db.example.com/app",
    "postgresql://u:p@db.example.com/production",
    "postgresql://u:p@localhost/app?options=env%3DPROD",
  ]) {
    blocked(
      {
        DATABASE_URL: url,
        NODE_ENV: "development",
        REPLIT_DEV_DOMAIN: "x.replit.dev",
        ALLOW_DEMO_DB_HOST: new URL(url).hostname,
      },
      /production-marked/,
    );
  }
});

test('does not treat "prod" in credentials as a production marker', () => {
  assertDemoSafeDatabase({
    DATABASE_URL: "postgresql://prod_reader:prodpw@localhost/appdb",
  });
});

test("blocks remote databases that cannot be verified as development (fail closed)", () => {
  blocked({ DATABASE_URL: REMOTE_URL }, /could not verify/);
  // NODE_ENV=development alone is just an operator assertion — not enough.
  blocked({ DATABASE_URL: REMOTE_URL, NODE_ENV: "development" }, /could not verify/);
  // Blanket flags don't exist; legacy-style overrides must not work.
  blocked({ DATABASE_URL: REMOTE_URL, ALLOW_DEMO_DATA: "1" }, /could not verify/);
  // A host opt-in for a DIFFERENT host must not authorize this one.
  blocked(
    { DATABASE_URL: REMOTE_URL, ALLOW_DEMO_DB_HOST: "other-host.example.com" },
    /could not verify/,
  );
  // Unparseable URLs are refused too.
  blocked({ DATABASE_URL: "not a url", ALLOW_DEMO_DB_HOST: "localhost" }, /could not verify/);
});

test("allows local databases", () => {
  assertDemoSafeDatabase({ DATABASE_URL: LOCAL_URL });
  assertDemoSafeDatabase({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/appdb" });
});

test("allows the Replit development workspace database", () => {
  assertDemoSafeDatabase({ DATABASE_URL: REMOTE_URL, REPLIT_DEV_DOMAIN: "x.replit.dev" });
});

test("allows a remote host only when ALLOW_DEMO_DB_HOST names that exact host", () => {
  assertDemoSafeDatabase({
    DATABASE_URL: REMOTE_URL,
    ALLOW_DEMO_DB_HOST: "db.some-cloud.example.com",
  });
  assertDemoSafeDatabase({
    DATABASE_URL: REMOTE_URL,
    ALLOW_DEMO_DB_HOST: " DB.Some-Cloud.Example.Com ",
  });
});
