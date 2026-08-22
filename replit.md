# Superior Patio Covers — Job Board & Sales Pipeline

Internal app for Superior Patio Covers (Justin Eyring, Twin Falls, Idaho): a
**Sales Pipeline** for leads and an operational **Job Board** for sold work,
replacing a Google-Sheets process. Desktop-first and dense, but fully usable
on a phone (the install crew works from one).

## Project overview

- **Frontend** (`artifacts/job-board`): React 19 + Vite + wouter + TanStack
  Query, served at preview path `/`. Pages: public landing `/`, Clerk
  `/sign-in` & `/sign-up`, `/board` (Job Board, default after sign-in),
  `/sales` (Sales Pipeline, admin-only), `/list` (dense table + CSV export +
  Archived view), `/team` (roles & invites, admin), `/feedback` (inbox,
  admin), `/settings` (stage editor + lead sheets, admin).
- **API** (`artifacts/api-server`): Express 5 at `/api`, implements
  `lib/api-spec/openapi.yaml` (orval codegen → `@workspace/api-client-react`,
  `@workspace/api-zod`). Routes in
  `src/routes/{users,jobs,stages,leadSources,feedback,leadSync,demo,health}.ts`.
- **DB** (`lib/db`): Drizzle + Postgres. Tables: `jobs`, `app_users`,
  `team_invites`, `job_notes`, `feedback`, `lead_imports`, **`stages`**,
  **`job_assignments`**, **`lead_sources`**.
- **Auth**: Clerk (cookie-based on web). `requireUser` provisions
  `app_users`; the first user ever becomes `admin`, and after that **sign-up
  is invite-only** — an email with no pending invite gets a 403 and no row.

## Run on Replit

- **Web App** runs the Vite frontend on port `18735` and proxies `/api` to the
  API server.
- **API Server** runs the Express API on port `8080`; its startup routine
  applies additive migrations and seeds the default pipeline stages for a
  fresh database.
- Required Replit secrets: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
  `VITE_CLERK_PUBLISHABLE_KEY`. Replit supplies `DATABASE_URL` automatically.
- Development Clerk (`pk_test_`) credentials enable the sign-in page's demo
  accounts. Do not use them for a published production app.

## Domain rules (read this before changing anything)

- **Stages are data, not code.** The `stages` table holds both pipelines;
  admins edit them at `/settings`. There is no stage enum — `jobs.stage`
  stores a stage `key` and the API validates it. A fresh database seeds
  Justin's original 17 stages (`DEFAULT_STAGES` in
  `lib/db/src/schema/stages.ts`); after that the table is the source of truth.
- **Two pipelines:** `stages.pipeline` is `sales` (leads) or `job` (sold
  work). Leads never appear in job counts, the Job List, the CSV export, or
  anything a non-admin can see.
- **The "Sold" gate is a pipeline boundary:** moving a job into *any*
  job-pipeline stage requires an Estimated Installation Date — enforced in
  the UI and the API (400). This survives renaming or deleting "Sold".
- Every board column and the list sort by Est. Install Date ascending, nulls
  last. `stages.is_complete` marks stages that count as finished (excluded
  from "late" and upcoming-install logic).
- **Roles:** `admin` = everything (Justin, Blair). `tech` = sees the whole
  Job Board and Job List, moves jobs into any job stage flagged
  `stages.tech_can_move`, adds notes; cannot edit fields, assign crew, or
  archive (Ryan, Denzil). `viewer` = read-only.
- **Crew assignment:** `job_assignments` is many-to-many. The Job Board and
  Job List have a "My jobs" toggle, on by default for techs.
- **Lead import:** `lead_sources` rows are Google Sheets the admin manages at
  `/settings` (paste a share link — it is normalized to a CSV export URL).
  Synced every 15 minutes and on demand. `lead_imports` is a **global** dedupe
  ledger, so the same lead appearing in two sheets imports once.
  ⚠️ The dedupe-key format in `leadSync.ts` is frozen — changing it would
  re-import every historical lead.
- Nothing is hard-deleted from the board: `jobs.archived_at` is a soft
  archive, restorable from the Job List's Archived view.
- Job toggles: Invoiced with QB, Deposit Paid, Ordered, Received.
- **Theme:** light / dark / system (device default), toggled in the sidebar.
  The palette lives entirely in CSS tokens in
  `artifacts/job-board/src/index.css` — the accent is Superior Patio's steel
  blue `#2D4E6B` (`#8FB0D1` in dark). Reverting the accent is a token edit;
  see the comment above `:root`.

## User preferences

- Dense, spreadsheet mental model; no scattered UI. No emojis in UI.
- Phone layout matters: the sidebar collapses to a top bar + drawer under
  768px and board columns become swipeable panels.

## Notes

- Workspace zod catalog is v4 (`pnpm-workspace.yaml`) — required by
  orval-generated zod code.
- After editing `lib/api-spec/openapi.yaml`, run
  `pnpm --filter @workspace/api-spec codegen`.
- Startup migrations (`artifacts/api-server/src/lib/migrations.ts`) are
  idempotent and run on every boot, so a new environment converges on its own.
- `lib/db/src/seed.ts` holds 14 **example** jobs for development only — they
  are not real customers and must be cleared before the client uses the app.
- The repo also runs outside Replit (`dev-local.mjs` + a local Postgres); the
  Vite `/api` proxy is gated on `REPL_ID` so Replit's own router still handles
  routing here.
- Canonical git remote: https://github.com/AtlasSolutions100/superior-patio-builder
