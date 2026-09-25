import { pool, DEFAULT_STAGES } from "@workspace/db";
import { logger } from "./logger";
import { LEGACY_SHEET_CSV_URL } from "./leadSync";

/**
 * Idempotent, additive schema migrations run at startup so fresh
 * environments (e.g. production) converge to the current schema without a
 * TTY-driven push. Every statement must be safe to re-run.
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz;

      CREATE TABLE IF NOT EXISTS job_notes (
        id serial PRIMARY KEY,
        job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        author_user_id integer REFERENCES app_users(id) ON DELETE SET NULL,
        author_name text NOT NULL,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS job_notes_job_id_idx ON job_notes(job_id);

      -- One-time backfill: carry each job's legacy last_note into the history
      -- so pre-existing notes are visible immediately. Only runs for jobs
      -- that have no history yet, so it never duplicates.
      INSERT INTO job_notes (job_id, author_name, text, created_at)
      SELECT j.id, 'Imported', j.last_note, j.updated_at
      FROM jobs j
      WHERE j.last_note IS NOT NULL
        AND btrim(j.last_note) <> ''
        AND NOT EXISTS (SELECT 1 FROM job_notes n WHERE n.job_id = j.id);

      -- Team feedback notes from the in-app Feedback button.
      CREATE TABLE IF NOT EXISTS feedback (
        id serial PRIMARY KEY,
        author_user_id integer REFERENCES app_users(id) ON DELETE SET NULL,
        author_name text NOT NULL,
        author_role text,
        message text NOT NULL,
        page text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- Ledger of spreadsheet rows already imported as leads (dedupe).
      CREATE TABLE IF NOT EXISTS lead_imports (
        id serial PRIMARY KEY,
        dedupe_key text NOT NULL UNIQUE,
        job_id integer REFERENCES jobs(id) ON DELETE SET NULL,
        imported_at timestamptz NOT NULL DEFAULT now()
      );

      -- Admin-editable pipeline stages (see lib/db/src/schema/stages.ts).
      CREATE TABLE IF NOT EXISTS stages (
        id serial PRIMARY KEY,
        key text NOT NULL UNIQUE,
        label text NOT NULL,
        pipeline text NOT NULL,
        position integer NOT NULL,
        tech_can_move boolean NOT NULL DEFAULT true,
        is_complete boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS stages_pipeline_position_idx ON stages(pipeline, position);

      -- Crew assignment (many-to-many): powers the "My jobs" view.
      CREATE TABLE IF NOT EXISTS job_assignments (
        id serial PRIMARY KEY,
        job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT job_assignments_job_user_uq UNIQUE (job_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS job_assignments_user_id_idx ON job_assignments(user_id);

      -- Who sold a job; drives the commission figure.
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sold_by_user_id integer
        REFERENCES app_users(id) ON DELETE SET NULL;

      -- Commission bands by contract size (Settings > Commission).
      CREATE TABLE IF NOT EXISTS commission_tiers (
        id serial PRIMARY KEY,
        up_to_amount numeric(12,2),
        rate_percent numeric(6,3) NOT NULL,
        position integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      -- Outside services (QuickBooks, Google Sheets) — Settings > Connections.
      CREATE TABLE IF NOT EXISTS integrations (
        id serial PRIMARY KEY,
        provider text NOT NULL UNIQUE,
        access_token text,
        refresh_token text,
        expires_at timestamptz,
        realm_id text,
        external_name text,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        connected_by_user_id integer,
        connected_at timestamptz,
        last_sync_at timestamptz,
        last_error text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qbo_customer_id text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sheet_synced_at timestamptz;

      -- Admin-managed lead sheets (Settings). Replaces the hardcoded/env URL.
      CREATE TABLE IF NOT EXISTS lead_sources (
        id serial PRIMARY KEY,
        name text NOT NULL,
        csv_url text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        last_synced_at timestamptz,
        last_error text,
        last_imported_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await seedStages();
    await seedLeadSources();
    await seedCommissionTiers();
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.error({ err }, "Startup migrations failed");
    throw err;
  }
}

/**
 * Seed the default stage list the first time a database boots on this
 * schema, then make sure every stage key referenced by an existing job has
 * a row (appended to the job pipeline) so no job is ever orphaned.
 */
async function seedStages(): Promise<void> {
  const { rows } = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM stages",
  );
  if (rows[0].count === 0) {
    const positions: Record<string, number> = {};
    const values: string[] = [];
    const params: unknown[] = [];
    for (const s of DEFAULT_STAGES) {
      positions[s.pipeline] = (positions[s.pipeline] ?? 0) + 1;
      const i = params.length;
      values.push(
        `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`,
      );
      params.push(
        s.key,
        s.label,
        s.pipeline,
        positions[s.pipeline],
        s.techCanMove ?? true,
        s.isComplete ?? false,
      );
    }
    await pool.query(
      `INSERT INTO stages (key, label, pipeline, position, tech_can_move, is_complete)
       VALUES ${values.join(", ")} ON CONFLICT (key) DO NOTHING`,
      params,
    );
    logger.info({ count: DEFAULT_STAGES.length }, "Seeded default stages");
  }

  // Converge: any job whose stage key has no row gets one (job pipeline,
  // label derived from the key) rather than silently vanishing from the board.
  const { rowCount } = await pool.query(`
    INSERT INTO stages (key, label, pipeline, position)
    SELECT DISTINCT j.stage,
           initcap(replace(j.stage, '_', ' ')),
           'job',
           (SELECT COALESCE(max(position), 0) FROM stages WHERE pipeline = 'job')
             + dense_rank() OVER (ORDER BY j.stage)
    FROM jobs j
    WHERE NOT EXISTS (SELECT 1 FROM stages s WHERE s.key = j.stage)
    ON CONFLICT (key) DO NOTHING
  `);
  if (rowCount) logger.warn({ rowCount }, "Created stages for orphaned job stage keys");
}

/**
 * One-time convergence for databases that were already syncing before lead
 * sources became data: carry the env/legacy sheet URL into the table so the
 * import keeps working. A fresh database gets NO sources — the admin adds
 * their own sheet on the Settings page.
 */
async function seedLeadSources(): Promise<void> {
  const { rows } = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM lead_sources",
  );
  if (rows[0].count > 0) return;

  const envUrl = process.env["LEAD_SHEET_CSV_URL"];
  const { rows: imports } = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM lead_imports",
  );
  if (!envUrl && imports[0].count === 0) return; // fresh install: stay empty

  await pool.query(
    "INSERT INTO lead_sources (name, csv_url) VALUES ($1, $2)",
    ["Lead sheet", envUrl || LEGACY_SHEET_CSV_URL],
  );
  logger.info("Seeded lead source from pre-Settings configuration");
}

/**
 * Seeds the one commission rate Justin gave on the Sep 22 call — contracts up
 * to $20,000 earn 3%. He said the rate steps up above that but did not say by
 * how much, so no further band is invented here: jobs above $20,000 show no
 * commission until he adds the next tier in Settings, which is a clearer
 * prompt than a wrong number.
 */
async function seedCommissionTiers(): Promise<void> {
  const { rows } = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM commission_tiers",
  );
  if (rows[0].count > 0) return;
  await pool.query(
    "INSERT INTO commission_tiers (up_to_amount, rate_percent, position) VALUES ($1, $2, $3)",
    ["20000.00", "3.000", 1],
  );
  logger.info("Seeded the starting commission tier (up to $20,000 at 3%)");
}
