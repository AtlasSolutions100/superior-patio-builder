/**
 * Entrypoint-level coverage: run the real seed/purge scripts as child
 * processes with unsafe configurations and verify they refuse before any
 * database work — even when override-style variables are set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// Run the scripts through node with tsx as a loader rather than the
// node_modules/.bin/tsx shim: on Windows that shim is tsx.cmd, which
// execFile cannot launch (and Node refuses .cmd without a shell), so the
// child produced no output and these tests failed on Windows only.
const SEED = path.join(here, "seed-demo.ts");
const PURGE = path.join(here, "purge-demo-data.ts");

// A remote, unmarked URL: nothing about it proves it is a dev database.
const REMOTE_URL = "postgresql://user:pw@db.some-cloud.example.com:5432/appdb";

function run(
  script: string,
  env: Record<string, string>,
  args: string[] = [],
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    // Start from a scrubbed env so the workspace's own REPLIT_DEV_DOMAIN /
    // DATABASE_URL cannot leak into the child and accidentally allow it.
    const base: Record<string, string> = { PATH: process.env.PATH ?? "" };
    execFile(
      process.execPath,
      ["--import", "tsx", script, ...args],
      { env: { ...base, ...env }, timeout: 30_000 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0;
        resolve({ code, output: `${stdout}\n${stderr}` });
      },
    );
  });
}

test("seed refuses an arbitrary remote URL even with override variables set", async () => {
  const { code, output } = await run(SEED, {
    DATABASE_URL: REMOTE_URL,
    NODE_ENV: "development",
    ALLOW_DEMO_DATA: "1",
    ALLOW_DEMO_DB_HOST: "some-other-host.example.com",
  });
  assert.notEqual(code, 0);
  assert.match(output, /Refusing to run/);
  assert.doesNotMatch(output, /Seeded/);
});

test("confirmed purge refuses an arbitrary remote URL even with override variables set", async () => {
  const { code, output } = await run(
    PURGE,
    {
      DATABASE_URL: REMOTE_URL,
      NODE_ENV: "development",
      ALLOW_DEMO_DATA: "1",
      ALLOW_DEMO_DB_HOST: "some-other-host.example.com",
    },
    ["--confirm"],
  );
  assert.notEqual(code, 0);
  assert.match(output, /Refusing to run/);
  assert.doesNotMatch(output, /After purge/);
});

test("seed refuses a production-marked URL in a dev-looking environment", async () => {
  const { code, output } = await run(SEED, {
    DATABASE_URL: "postgresql://u:p@localhost:5432/app_prod",
    REPLIT_DEV_DOMAIN: "x.replit.dev",
  });
  assert.notEqual(code, 0);
  assert.match(output, /production-marked/);
});

test("confirmed purge refuses inside a Replit deployment", async () => {
  const { code, output } = await run(
    PURGE,
    {
      DATABASE_URL: "postgresql://u:p@localhost:5432/appdb",
      REPLIT_DEPLOYMENT: "1",
    },
    ["--confirm"],
  );
  assert.notEqual(code, 0);
  assert.match(output, /Replit deployment/);
});
