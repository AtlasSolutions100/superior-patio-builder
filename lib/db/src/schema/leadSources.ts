import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Google Sheets the lead importer pulls from (admin-managed in Settings).
 * Each row is one publicly-readable sheet; the sync loop fetches every
 * enabled source. The dedupe ledger (lead_imports) is global, so the same
 * lead appearing in two sheets still imports exactly once.
 */
export const leadSourcesTable = pgTable("lead_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Normalized CSV export URL (docs.google.com share links are converted). */
  csvUrl: text("csv_url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastImportedCount: integer("last_imported_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type LeadSource = typeof leadSourcesTable.$inferSelect;
