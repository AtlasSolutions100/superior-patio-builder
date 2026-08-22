/**
 * Fail-closed guard for the demo seed/purge scripts.
 *
 * These scripts write to (or delete from) whatever database DATABASE_URL
 * points at, so they must only ever run against a development database.
 *
 * Hard denies (nothing can override them):
 *   - DATABASE_URL missing
 *   - running inside a Replit deployment (REPLIT_DEPLOYMENT is set)
 *   - NODE_ENV=production
 *   - a DATABASE_URL that looks production-marked (contains "prod")
 *
 * After that, the database target itself must be verifiably a development
 * one. Exactly these qualify:
 *   - the database host is local (localhost / 127.0.0.1 / ::1), or
 *   - we are inside a Replit development workspace (REPLIT_DEV_DOMAIN is
 *     set and REPLIT_DEPLOYMENT is not), where DATABASE_URL is the
 *     workspace-provisioned development database, or
 *   - the operator has named this exact host in ALLOW_DEMO_DB_HOST — a
 *     target-bound opt-in, so a stray blanket flag can never authorize an
 *     arbitrary database.
 *
 * Anything else — any remote, unrecognized database — is refused.
 * Call `assertDemoSafeDatabase()` before importing/initializing the DB
 * client or issuing any query.
 */

export class DemoGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoGuardError";
  }
}

export type GuardEnv = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertDemoSafeDatabase(env: GuardEnv = process.env): void {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new DemoGuardError(
      "DATABASE_URL is not set — refusing to run the demo data script.",
    );
  }

  // Hard denies: nothing overrides these.
  if (env.REPLIT_DEPLOYMENT) {
    throw new DemoGuardError(
      "Refusing to run: this looks like a Replit deployment " +
        "(REPLIT_DEPLOYMENT is set). Demo data scripts are development-only " +
        "and must never touch a live customer database.",
    );
  }
  if (env.NODE_ENV === "production") {
    throw new DemoGuardError(
      "Refusing to run: NODE_ENV=production. Demo data scripts are " +
        "development-only and must never touch a live customer database.",
    );
  }
  if (/prod/i.test(stripCredentials(url))) {
    throw new DemoGuardError(
      "Refusing to run: DATABASE_URL looks production-marked (it contains " +
        '"prod"). Demo data scripts are development-only. If this really is ' +
        "a development database, rename it so it is not production-marked.",
    );
  }

  // The target itself must be verifiably a development database.
  const host = hostOf(url);
  if (host && LOCAL_HOSTS.has(host.toLowerCase())) {
    return; // local database
  }
  if (env.REPLIT_DEV_DOMAIN) {
    return; // Replit development workspace (deployment already excluded above)
  }
  const allowedHost = env.ALLOW_DEMO_DB_HOST?.trim().toLowerCase();
  if (allowedHost && host && allowedHost === host.toLowerCase()) {
    return; // operator explicitly named this exact host as a dev database
  }

  throw new DemoGuardError(
    "Refusing to run: could not verify that DATABASE_URL points at a " +
      "development database. Demo data scripts only run against a local " +
      "database (localhost/127.0.0.1), inside a Replit development " +
      "workspace, or when ALLOW_DEMO_DB_HOST is set to this database's " +
      `exact host${host ? ` (${host})` : ""}.`,
  );
}

/** Hostname of the connection URL, or null when it cannot be parsed. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** Drop the user:password part so credentials never influence (or leak via) checks. */
function stripCredentials(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    // Not URL-parseable — check the raw string minus anything before an '@'.
    const at = url.indexOf("@");
    return at >= 0 ? url.slice(at + 1) : url;
  }
}
