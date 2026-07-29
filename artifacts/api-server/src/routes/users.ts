import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import {
  GetCurrentUserResponse,
  ListUsersResponse,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/me", requireUser, async (req, res): Promise<void> => {
  const u = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      id: u.id,
      clerkUserId: u.clerkUserId,
      email: u.email,
      name: u.name,
      role: u.role,
    }),
  );
});

router.get("/users", requireUser, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(appUsersTable)
    .orderBy(appUsersTable.createdAt);
  res.json(
    ListUsersResponse.parse(
      users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    ),
  );
});

router.patch(
  "/users/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateUserRoleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateUserRoleBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [user] = await db
      .update(appUsersTable)
      .set({ role: body.data.role })
      .where(eq(appUsersTable.id, params.data.id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(
      UpdateUserRoleResponse.parse({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }),
    );
  },
);

export default router;
