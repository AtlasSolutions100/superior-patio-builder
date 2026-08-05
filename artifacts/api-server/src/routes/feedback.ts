import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, feedbackTable } from "@workspace/db";
import {
  SubmitFeedbackBody,
  SubmitFeedbackResponse,
  ListFeedbackResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(row: typeof feedbackTable.$inferSelect) {
  return {
    id: row.id,
    message: row.message,
    page: row.page,
    authorName: row.authorName,
    authorRole: row.authorRole,
    createdAt: row.createdAt.toISOString(),
  };
}

// Any signed-in user may submit feedback.
router.post("/feedback", requireUser, async (req, res): Promise<void> => {
  const body = SubmitFeedbackBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Feedback message is required" });
    return;
  }
  const message = body.data.message.trim();
  if (!message) {
    res.status(400).json({ error: "Feedback message is required" });
    return;
  }

  const u = req.appUser!;
  const [row] = await db
    .insert(feedbackTable)
    .values({
      authorUserId: u.id,
      authorName: u.name || u.email || "Unknown",
      authorRole: u.role,
      message,
      page: body.data.page?.slice(0, 200) || null,
    })
    .returning();

  res.status(201).json(SubmitFeedbackResponse.parse(serialize(row)));
});

// Admins review the list, newest first.
router.get(
  "/feedback",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(feedbackTable)
      .orderBy(desc(feedbackTable.createdAt), desc(feedbackTable.id));
    res.json(ListFeedbackResponse.parse(rows.map(serialize)));
  },
);

export default router;
