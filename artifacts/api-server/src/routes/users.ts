import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, appUsersTable, teamInvitesTable } from "@workspace/db";
import {
  GetCurrentUserResponse,
  ListUsersResponse,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
  ListInvitesResponse,
  CreateInviteBody,
  CreateInviteResponse,
  UpdateInviteParams,
  UpdateInviteBody,
  UpdateInviteResponse,
  DeleteInviteParams,
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

    if (params.data.id === req.appUser!.id && body.data.role !== "admin") {
      res.status(400).json({ error: "You cannot demote yourself" });
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

router.get("/invites", requireUser, requireAdmin, async (_req, res): Promise<void> => {
  const invites = await db
    .select()
    .from(teamInvitesTable)
    .orderBy(teamInvitesTable.createdAt);
  res.json(
    ListInvitesResponse.parse(
      invites.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    ),
  );
});

router.post("/invites", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const body = CreateInviteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email and role" });
    return;
  }
  const email = body.data.email.trim().toLowerCase();

  const [existingUser] = await db
    .select()
    .from(appUsersTable)
    .where(sql`lower(${appUsersTable.email}) = ${email}`);
  if (existingUser) {
    res.status(409).json({ error: "That email already belongs to a team member" });
    return;
  }

  const [invite] = await db
    .insert(teamInvitesTable)
    .values({ email, role: body.data.role })
    .onConflictDoNothing({ target: teamInvitesTable.email })
    .returning();
  if (!invite) {
    res.status(409).json({ error: "That email has already been invited" });
    return;
  }

  res.status(201).json(
    CreateInviteResponse.parse({
      ...invite,
      createdAt: invite.createdAt.toISOString(),
    }),
  );
});

router.patch(
  "/invites/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateInviteParams.safeParse(req.params);
    const body = UpdateInviteBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [invite] = await db
      .update(teamInvitesTable)
      .set({ role: body.data.role })
      .where(eq(teamInvitesTable.id, params.data.id))
      .returning();
    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    res.json(
      UpdateInviteResponse.parse({
        ...invite,
        createdAt: invite.createdAt.toISOString(),
      }),
    );
  },
);

router.delete(
  "/invites/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteInviteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [invite] = await db
      .delete(teamInvitesTable)
      .where(eq(teamInvitesTable.id, params.data.id))
      .returning();
    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    res.status(204).end();
  },
);

export default router;
