import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Admin-editable pipeline stages. Two pipelines:
 *   - "sales": leads (New Lead → … ). Jobs here are excluded from the Job
 *     Board, job counts, pipeline $ totals, and CSV export.
 *   - "job":   post-sale operational stages shown on the Job Board. Moving a
 *     job INTO this pipeline requires an Estimated Install Date (the "Sold
 *     gate"), regardless of what the first stage is called.
 *
 * `jobs.stage` stores the stage `key`. Referential integrity is enforced by
 * the API (stage keys are validated on write; deleting a stage reassigns its
 * jobs in the same transaction) rather than a DB-level FK, so that
 * `drizzle-kit push` on an existing database never has to race the seed.
 */
export const STAGE_PIPELINES = ["sales", "job"] as const;
export type StagePipeline = (typeof STAGE_PIPELINES)[number];

export const stagesTable = pgTable("stages", {
  id: serial("id").primaryKey(),
  /** Stable slug used as jobs.stage. Generated from the label on create. */
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  pipeline: text("pipeline").notNull(), // sales | job
  /** Order within its pipeline (1-based, gaps allowed). */
  position: integer("position").notNull(),
  /** Install techs may move jobs INTO this stage (job pipeline only). */
  techCanMove: boolean("tech_can_move").notNull().default(true),
  /** Work is finished: excluded from "late" / "upcoming install" logic. */
  isComplete: boolean("is_complete").notNull().default(false),
  /** Soft delete. Archived stages keep their key so history stays readable. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Stage = typeof stagesTable.$inferSelect;
export type InsertStage = typeof stagesTable.$inferInsert;

/**
 * The stage list Justin originally provided, used to seed a fresh database
 * (and to converge existing databases the first time they boot on this
 * schema). After seeding, the `stages` table is the source of truth.
 */
export const DEFAULT_STAGES: ReadonlyArray<{
  key: string;
  label: string;
  pipeline: StagePipeline;
  techCanMove?: boolean;
  isComplete?: boolean;
}> = [
  { key: "new_lead", label: "New Lead", pipeline: "sales", techCanMove: false },
  { key: "scheduled", label: "Scheduled", pipeline: "sales", techCanMove: false },
  { key: "bid_given", label: "Bid Given", pipeline: "sales", techCanMove: false },
  { key: "sold", label: "Sold", pipeline: "job" },
  { key: "invoiced_with_quickbooks", label: "Invoiced with QuickBooks", pipeline: "job" },
  { key: "deposit_paid", label: "Deposit Paid", pipeline: "job" },
  { key: "pre_order_site_visit", label: "Pre Order Site Visit", pipeline: "job" },
  { key: "material_ordered", label: "Material Ordered", pipeline: "job" },
  { key: "non_standard_material_ordered", label: "Non Standard Material Ordered", pipeline: "job" },
  { key: "permit_applied", label: "Permit Applied", pipeline: "job" },
  { key: "footings_needed", label: "Footings Needed", pipeline: "job" },
  { key: "other_prep_work", label: "Other Prep Work", pipeline: "job" },
  { key: "material_received", label: "Material Received", pipeline: "job" },
  { key: "ready_to_install", label: "Ready to Install", pipeline: "job" },
  { key: "installed", label: "Installed", pipeline: "job", isComplete: true },
  { key: "post_install_follow_up", label: "Post Install Follow up", pipeline: "job", isComplete: true },
  { key: "review_asked", label: "Google Review or referral Asked for", pipeline: "job", isComplete: true },
];
