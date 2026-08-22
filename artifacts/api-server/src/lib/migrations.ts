import { pool, DEFAULT_STAGES } from "@workspace/db";
import { logger } from "./logger";

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
    `);

    await seedStages();
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
