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

## Deploy notes

- The API is stateless: any Node host + any Postgres. The web app builds to
  static files (`pnpm --filter @workspace/job-board build`, `BASE_PATH=/`);
  serve them and route `/api/*` to the API server.
- Production needs a Clerk **production** instance (`pk_live_`/`sk_live_`) —
  demo logins disable themselves automatically on live keys.
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` and the
  `.replit`/`replit.md` files are leftovers from the Replit era; harmless
  elsewhere (the proxy no-ops without its env), removable once Replit is
  fully retired.

Project docs: `project-brief.md` (original client brief) and the field guide /
gameplan artifacts linked from the dev session notes.
