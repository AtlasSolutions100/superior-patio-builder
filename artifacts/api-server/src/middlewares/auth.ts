import type { NextFunction, Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, appUsersTable, type AppUser } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appUsersTable);
    const role = count === 0 ? "admin" : "viewer";

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
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
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
