import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A job's stage is the `key` of a row in the `stages` table (see
 * ./stages.ts). Stages are admin-editable, so this is a plain string; the API
 * validates keys on every write.
 */
export type JobStage = string;

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  coverType: text("cover_type"),
  contractAmount: numeric("contract_amount", { precision: 12, scale: 2 }),
  source: text("source"),
  estimatedInstallDate: date("estimated_install_date", { mode: "string" }),
  stage: text("stage").notNull().default("new_lead"),
  lastNote: text("last_note"),
  /** Who sold it — drives commission. Null for leads and older jobs. */
  soldByUserId: integer("sold_by_user_id"),
  /** QuickBooks Customer id once this job has been pushed there. */
  qboCustomerId: text("qbo_customer_id"),
  /** When this job was appended to the connected Google Sheet. */
  sheetSyncedAt: timestamp("sheet_synced_at", { withTimezone: true }),
  invoicedWithQb: boolean("invoiced_with_qb").notNull().default(false),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  materialOrdered: boolean("material_ordered").notNull().default(false),
  materialReceived: boolean("material_received").notNull().default(false),
  // Soft archive: non-null = hidden from the main board/list (never deleted).
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
