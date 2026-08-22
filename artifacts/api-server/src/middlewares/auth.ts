import type { NextFunction, Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, appUsersTable, teamInvitesTable, type AppUser } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { DEMO_ROLE_BY_EMAIL } from "../lib/demoAccounts";

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUser;
    }
  }
}

/**
 * Requires a Clerk session and just-in-time provisions a local app_users row.
 * The first user to ever sign in becomes admin; everyone else defaults to viewer.
 * Demo accounts are pre-mapped to their role via DEMO_ROLE_BY_EMAIL.
 */
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId));

  if (!user) {
    let email: string | null = null;
    let name: string | null = null;
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
      name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null;
    } catch (err) {
      req.log.warn({ err }, "Could not fetch Clerk user profile");
    }

    let role: string | undefined = email
      ? DEMO_ROLE_BY_EMAIL[email.toLowerCase()]
      : undefined;
    let matchedInviteId: number | undefined;
    if (!role && email) {
      // A pending team invite pre-assigns this email's role.
      const [invite] = await db
        .select()
        .from(teamInvitesTable)
        .where(sql`lower(${teamInvitesTable.email}) = ${email.toLowerCase()}`);
      if (invite) {
        role = invite.role;
        matchedInviteId = invite.id;
      }
    }
    if (!role) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appUsersTable);
      if (count === 0) {
        // Bootstrap: the very first person to ever sign in owns the app.
        role = "admin";
      } else {
        // Invite-only: an unknown email gets no account and no data. The
        // Clerk user may exist, but nothing is provisioned here.
        res.status(403).json({
          error: `This app is invite-only. Ask your admin to invite ${
            email ?? "your email"
          } on the Team page, then sign in again.`,
        });
        return;
      }
    }

    [user] = await db
      .insert(appUsersTable)
      .values({ clerkUserId, email, name, role })
      .onConflictDoNothing({ target: appUsersTable.clerkUserId })
      .returning();

    if (!user) {
      // Raced with a concurrent request; read the existing row.
      [user] = await db
        .select()
        .from(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, clerkUserId));
    }

    if (user && matchedInviteId !== undefined) {
      // Invite consumed — remove the pending entry.
      await db
        .delete(teamInvitesTable)
        .where(eq(teamInvitesTable.id, matchedInviteId));
    }
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (user.removedAt) {
    // Account was removed by an admin — access stays revoked even if they sign in again.
    res.status(403).json({ error: "Your access has been removed" });
    return;
  }

  req.appUser = user;
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.appUser?.role !== "admin") {
    res.status(403).json({ error: "Requires full access" });
    return;
  }
  next();
}
