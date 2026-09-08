# Superior Patio Covers — Job Board & Sales Pipeline

Internal job-tracking app for Superior Patio Covers (Twin Falls, ID): a Sales
Pipeline for leads and an operational Job Board for sold work, replacing a
Google-Sheets workflow. Originally prototyped on Replit; now a standalone app
that runs against any Postgres.

**What it does**

- **Sales Pipeline** (admin-only): leads as kanban columns, auto-imported from
  Google Sheets every 15 minutes (admin-managed sheet URLs in Settings) plus
  quick manual capture. Click-to-call, filters, bulk cleanup.
- **Job Board / Job List**: sold work as one column per stage, every column
  sorted by soonest Estimated Install Date; dense table twin with inline
  toggles and CSV export. Moving a job into the job pipeline *requires* an
  install date.
- **Editable stages**: both pipelines' stages are rows in the database —
  admins rename/reorder/add/remove them in Settings; removal reassigns jobs.
- **Crew**: many-to-many job assignment, a "My jobs" view (default for
  techs), per-stage control over what techs may move. Phone-friendly layout.
- **Access**: Clerk auth, invite-only sign-up, roles admin / tech / viewer.

## Layout (pnpm workspace)

| Path | What |
|---|---|
| `artifacts/job-board` | React 19 + Vite + wouter + TanStack Query front end |
| `artifacts/api-server` | Express 5 API (`/api`), startup migrations, sheet-sync loop |
| `lib/db` | Drizzle schema + seed (Postgres) |
| `lib/api-spec` | OpenAPI spec — source of truth for the API |
| `lib/api-client-react`, `lib/api-zod` | orval-generated client + zod validators (`pnpm --filter @workspace/api-spec codegen`) |

## Local development

Requirements: Node ≥ 24, pnpm ≥ 10, a Postgres, Clerk keys (dev instance).

```sh
pnpm install
cp .env.example .env        # fill in DATABASE_URL + Clerk keys
pnpm --filter @workspace/db push    # create tables (needs DATABASE_URL in env)
pnpm --filter @workspace/db seed    # optional: 14 example jobs
node dev-local.mjs          # DB (embedded PG helper, if configured) + API :8080 + web :18735
```

Open http://localhost:18735. With a Clerk **dev** (`pk_test_`) key the sign-in
page shows one-click demo logins (admin / tech / viewer); the API self-heals
those accounts on startup. Startup migrations are idempotent and run on every
boot — fresh databases get the default 17-stage pipeline automatically.

Tests: `pnpm --filter @workspace/api-server test` (needs `DATABASE_URL`).
Typecheck everything: `pnpm typecheck`.

## Deploy

The app deploys as **one service**: the API server also serves the built web
app when `WEB_DIST` is set, so there is no CORS, reverse proxy, or routing
config to get wrong. Works on any container/Node host (Railway, Render, Fly,
Cloud Run, a VPS).

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm run build:deploy` |
| Start command | `pnpm run start:deploy` |
| Health check | `/api/healthz` |

Environment variables:

```sh
DATABASE_URL=postgres://...            # any Postgres
NODE_ENV=production
PORT=8080                              # most hosts inject this
WEB_DIST=artifacts/job-board/dist/public
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... # must be set at BUILD time
```

`VITE_*` values are baked into the bundle at build time, not read at runtime —
set it before the build step or the front end ships with the wrong key.

Notes:

- The API runs a background lead-sync interval, so it needs a **long-running
  process**. Container hosts are fine; serverless/edge functions are not.
- Schema changes apply themselves: startup migrations are idempotent and run
  on boot, and a fresh database seeds the default stages.
- Production needs a Clerk **production** instance (`pk_live_`/`sk_live_`).
  The one-click demo logins disable themselves on live keys and whenever
  `NODE_ENV=production` — that is deliberate. In production the first person
  to sign up becomes admin; everyone else needs an invite from `/team`.
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` and the
  `.replit`/`replit.md` files are leftovers from the Replit era; harmless
  elsewhere (the proxy no-ops unless the front end is told to use it), and
  removable once Replit is fully retired.

Project docs: `project-brief.md` (original client brief) and the field guide /
gameplan artifacts linked from the dev session notes.
