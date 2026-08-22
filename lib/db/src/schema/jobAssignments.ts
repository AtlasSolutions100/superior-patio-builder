import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { appUsersTable } from "./users";

/**
 * Which team members are assigned to a job (install crew is usually two
 * people, so this is many-to-many). Powers the "My jobs" view for techs.
 */
export const jobAssignmentsTable = pgTable(
  "job_assignments",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("job_assignments_job_user_uq").on(t.jobId, t.userId)],
);

export type JobAssignment = typeof jobAssignmentsTable.$inferSelect;
