import { sql } from "drizzle-orm";
import { jobsTable } from "@workspace/db";

/**
 * When the lead actually came in: the spreadsheet submission date recorded in
 * the import ledger (dedupe keys start with "YYYY-MM-DD HH:MM:SS|" or just
 * "YYYY-MM-DD|") when the job was imported, falling back to the record's
 * created-at for manual leads or leads whose ledger key is malformed.
 *
 * NOTE: the correlated column must be written fully qualified ("jobs"."id")
 * — drizzle renders `${jobsTable.id}` unqualified in a SELECT-field context,
 * which would silently bind to lead_imports' own id inside the subquery.
 * This expression is safe in both SELECT-field and WHERE contexts as long as
 * the outer query selects from the jobs table (no alias).
 */
export const leadDateSql = sql<string | null>`COALESCE(
  (SELECT CASE WHEN split_part(li.dedupe_key, '|', 1) ~ '^\\d{4}-\\d{2}-\\d{2}( \\d{2}:\\d{2}:\\d{2})?$'
               AND pg_input_is_valid(split_part(li.dedupe_key, '|', 1), 'timestamptz')
               THEN split_part(li.dedupe_key, '|', 1)::timestamptz END
   FROM lead_imports li WHERE li.job_id = "jobs"."id" LIMIT 1),
  ${jobsTable.createdAt}
)`;
