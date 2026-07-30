import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { appUsersTable } from "./users";

/**
 * Running note history per job. `authorName` is a snapshot so notes stay
 * attributed even if the author's profile changes or account is removed.
 */
export const jobNotesTable = pgTable("job_notes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").references(() => appUsersTable.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type JobNote = typeof jobNotesTable.$inferSelect;
