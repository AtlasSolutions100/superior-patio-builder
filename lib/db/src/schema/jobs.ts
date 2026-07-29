import {
  pgTable,
  text,
  serial,
  timestamp,
  date,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const JOB_STAGES = [
  "new_lead",
  "scheduled",
  "bid_given",
  "sold",
  "invoiced_with_quickbooks",
  "deposit_paid",
  "pre_order_site_visit",
  "material_ordered",
  "non_standard_material_ordered",
  "permit_applied",
  "footings_needed",
  "other_prep_work",
  "material_received",
  "ready_to_install",
  "installed",
  "post_install_follow_up",
  "review_asked",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Stages at or beyond "sold" require an estimated install date. */
export const POST_SOLD_STAGES: readonly JobStage[] = JOB_STAGES.slice(
  JOB_STAGES.indexOf("sold"),
);

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
  invoicedWithQb: boolean("invoiced_with_qb").notNull().default(false),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  materialOrdered: boolean("material_ordered").notNull().default(false),
  materialReceived: boolean("material_received").notNull().default(false),
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
