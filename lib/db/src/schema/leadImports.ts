import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

/**
 * Ledger of spreadsheet rows already imported as leads. Once a row's dedupe
 * key is here it is never imported again, even if the created job is later
 * edited, moved, sold, or archived — the app owns the lead after import.
 */
export const leadImportsTable = pgTable("lead_imports", {
  id: serial("id").primaryKey(),
  /** Stable key derived from the sheet row (date + cleaned phone/name). */
  dedupeKey: text("dedupe_key").notNull().unique(),
  jobId: integer("job_id").references(() => jobsTable.id, {
    onDelete: "set null",
  }),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LeadImport = typeof leadImportsTable.$inferSelect;
