---
name: Demo data guard policy
description: Fail-closed rules that gate the demo seed/purge scripts to development databases only.
---

**Rule:** Demo seed/purge scripts must call `assertDemoSafeDatabase()` (scripts/src/demo-guard.ts) before the DB client is even dynamically imported. Hard denies (no override): REPLIT_DEPLOYMENT set, NODE_ENV=production, or "prod" anywhere in the credential-stripped DATABASE_URL. A target only qualifies as dev if the host is local, the run is in a Replit workspace (REPLIT_DEV_DOMAIN), or ALLOW_DEMO_DB_HOST names the exact host.

**Why:** Completion review rejected a blanket `ALLOW_DEMO_DATA=1` opt-in — an unbound env flag can be misconfigured in CI/prod and authorize destroying a live customer DB. Overrides must be target-bound, and production markers must beat every override.

**How to apply:** Any new script or startup path that writes/deletes demo data (e.g. demo-user provisioning) should reuse this guard and add entrypoint-level tests spawning the real script with a scrubbed env to prove refusal.
