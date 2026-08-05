import { pool } from "@workspace/db";
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
    `);
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.error({ err }, "Startup migrations failed");
    throw err;
  }
}
