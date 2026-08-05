import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { appUsersTable } from "./users";

/**
 * Team feedback notes submitted from the in-app Feedback button.
 * `authorName`/`authorRole` are snapshots so entries stay attributed even if
 * the sender's profile changes or their account is removed.
 */
export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  authorUserId: integer("author_user_id").references(() => appUsersTable.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role"),
  message: text("message").notNull(),
  page: text("page"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FeedbackRow = typeof feedbackTable.$inferSelect;
