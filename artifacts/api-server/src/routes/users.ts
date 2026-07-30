import { Router, type IRouter } from "express";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, appUsersTable, teamInvitesTable } from "@workspace/db";
import {
  GetCurrentUserResponse,
  ListUsersResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
  RemoveUserParams,
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

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/;

/**
 * Normalizes and validates a username from a request body.
 * Returns { value } on success (null clears the username) or { error }.
 */
function parseUsername(raw: string | null | undefined): {
  value?: string | null;
  error?: string;
} {
  if (raw === undefined) return { value: undefined };
  const trimmed = raw?.trim().toLowerCase() ?? null;
  if (!trimmed) return { value: null };
  if (!USERNAME_RE.test(trimmed)) {
    return {
      error:
        "Usernames are 2–24 characters: lowercase letters, numbers, dots, dashes, underscores",
    };
  }
  return { value: trimmed };
}

async function isUsernameTaken(
  username: string,
  excludeUserId: number,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(
      and(eq(appUsersTable.username, username), ne(appUsersTable.id, excludeUserId)),
    );
  return !!existing;
}

router.get("/me", requireUser, async (req, res): Promise<void> => {
  const u = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      id: u.id,
      clerkUserId: u.clerkUserId,
      email: u.email,
      name: u.name,
      username: u.username,
      role: u.role,
    }),
  );
});

router.patch("/me", requireUser, async (req, res): Promise<void> => {
  const body = UpdateMyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid profile" });
    return;
  }

  const updates: { name?: string; username?: string | null } = {};
  if (body.data.name !== undefined) {
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updates.name = name;
  }
  const username = parseUsername(body.data.username);
  if (username.error) {
    res.status(400).json({ error: username.error });
    return;
  }
  if (username.value !== undefined) {
    if (
      username.value &&
      (await isUsernameTaken(username.value, req.appUser!.id))
    ) {
      res.status(409).json({ error: "That username is already taken" });
      return;
    }
    updates.username = username.value;
  }

  const [user] = Object.keys(updates).length
    ? await db
        .update(appUsersTable)
        .set(updates)
        .where(eq(appUsersTable.id, req.appUser!.id))
        .returning()
    : [req.appUser!];

  res.json(
    UpdateMyProfileResponse.parse({
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
    }),
  );
});

router.get("/users", requireUser, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(appUsersTable)
    .where(isNull(appUsersTable.removedAt))
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

    if (
      params.data.id === req.appUser!.id &&
      body.data.role !== undefined &&
      body.data.role !== "admin"
    ) {
      res.status(400).json({ error: "You cannot demote yourself" });
      return;
    }

    const updates: { role?: string; name?: string; username?: string | null } = {};
    if (body.data.role !== undefined) updates.role = body.data.role;
    if (body.data.name !== undefined) {
      const name = body.data.name.trim();
      if (!name) {
        res.status(400).json({ error: "Name cannot be empty" });
        return;
      }
      updates.name = name;
    }
    const username = parseUsername(body.data.username);
    if (username.error) {
      res.status(400).json({ error: username.error });
      return;
    }
    if (username.value !== undefined) {
      if (
        username.value &&
        (await isUsernameTaken(username.value, params.data.id))
      ) {
        res.status(409).json({ error: "That username is already taken" });
        return;
      }
      updates.username = username.value;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [user] = await db
      .update(appUsersTable)
      .set(updates)
      .where(
        and(eq(appUsersTable.id, params.data.id), isNull(appUsersTable.removedAt)),
      )
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

router.delete(
  "/users/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = RemoveUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    if (params.data.id === req.appUser!.id) {
      res.status(400).json({ error: "You cannot remove your own account" });
      return;
    }

    const [target] = await db
      .select()
      .from(appUsersTable)
      .where(
        and(eq(appUsersTable.id, params.data.id), isNull(appUsersTable.removedAt)),
      );
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (target.role === "admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUsersTable)
        .where(
          and(eq(appUsersTable.role, "admin"), isNull(appUsersTable.removedAt)),
        );
      if (count <= 1) {
        res.status(400).json({ error: "The last admin cannot be removed" });
        return;
      }
    }

    // Soft-delete: keeps the row so a future sign-in with this account is
    // recognized as removed instead of being silently re-provisioned.
    await db
      .update(appUsersTable)
      .set({ removedAt: new Date() })
      .where(eq(appUsersTable.id, params.data.id));

    res.status(204).end();
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
  if (existingUser && !existingUser.removedAt) {
    res.status(409).json({ error: "That email already belongs to a team member" });
    return;
  }
  if (existingUser?.removedAt) {
    // Re-inviting a removed account: drop the old row so their next sign-in
    // re-provisions them cleanly with the invited role.
    await db.delete(appUsersTable).where(eq(appUsersTable.id, existingUser.id));
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
