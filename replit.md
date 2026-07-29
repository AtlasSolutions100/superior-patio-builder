# Superior Patio Covers Job Board

Job status board for Superior Patio Covers (Justin Eyring, Twin Falls, Idaho) — a patio cover / pergola design & install company. Desktop-first, dense "spreadsheet-feel" Kanban tracking every job from lead through Google review.

## Project overview

- **Frontend** (`artifacts/job-board`): React + Vite + wouter + TanStack Query, served at preview path `/`. Pages: public landing `/`, Clerk `/sign-in` & `/sign-up`, Kanban `/board` (default after sign-in; Operations view = post-Sold stages, plus a Sales Pipeline view), dense `/list` table with filters + CSV export, `/team` role management (admins).
- **API** (`artifacts/api-server`): Express 5 at `/api`, implements `lib/api-spec/openapi.yaml` (orval codegen → `@workspace/api-client-react`, `@workspace/api-zod`). Routes in `src/routes/{users,jobs}.ts`.
- **DB** (`lib/db`): Drizzle + Postgres. Tables: `jobs`, `app_users`. Stage enum + `POST_SOLD_STAGES` in `lib/db/src/schema/jobs.ts`.
- **Auth**: Replit-managed Clerk (cookie-based on web). `requireUser` middleware JIT-provisions `app_users`; first signup ever becomes `admin`, later signups default to `viewer`.

## Domain rules

- Stages (exact order): New Lead, Scheduled, Bid Given, Sold, Invoiced with QuickBooks, Deposit Paid, Pre Order Site Visit, Material Ordered, Non Standard Material Ordered, Permit Applied, Footings Needed, Other Prep Work, Material Received, Ready to Install, Installed, Post Install Follow up, Google Review or referral Asked for.
- Moving to Sold (or any later stage) **requires an Estimated Installation Date** — enforced in UI and API (400).
- Every board column and the list are sorted by Est. Install Date ascending, nulls last.
- Roles: `admin` = full edit (Justin, Blair); `tech` = view + move to Installed + edit note (Ryan, Denzil); `viewer` = read-only. Admin assigns roles at `/team`.
- Job toggles: Invoiced with QB, Deposit Paid, Ordered, Received.

## User preferences

- Dense, desktop-first, spreadsheet mental model; no scattered UI. No emojis in UI.

## Notes

- Workspace zod catalog is v4 (`pnpm-workspace.yaml`) — required by orval-generated zod code.
- 14 seeded example jobs in the dev database.
