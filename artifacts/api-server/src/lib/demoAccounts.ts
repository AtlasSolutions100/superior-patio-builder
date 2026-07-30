import { clerkClient } from "@clerk/express";
import { db, appUsersTable, type AppUser } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Seeded demo accounts (dev-only Clerk users) get a fixed role instead of
 * going through the first-signup-becomes-admin rule.
 */
export const DEMO_ROLE_BY_EMAIL: Record<string, AppUser["role"]> = {
  "admin@demo.com": "admin",
  "tech@demo.com": "tech",
  "viewer@demo.com": "viewer",
};

const DEMO_PASSWORD = "password123";

const DEMO_NAME_BY_EMAIL: Record<string, { firstName: string; lastName: string }> = {
  "admin@demo.com": { firstName: "Demo", lastName: "Admin" },
  "tech@demo.com": { firstName: "Demo", lastName: "Tech" },
  "viewer@demo.com": { firstName: "Demo", lastName: "Viewer" },
};

/**
 * Demo logic is development-only: the sign-in page renders the demo buttons
 * only for a development (pk_test) Clerk instance, so provisioning and
 * removal protection use the same gate.
 */
export function isDemoEnvironment(): boolean {
  return (process.env.CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() in DEMO_ROLE_BY_EMAIL;
}

/**
 * Idempotent, self-healing provisioning of the demo accounts.
 * Ensures each demo user exists in Clerk (pre-verified, known password) and
 * has a live app_users row with the correct role. Safe to run on every
 * server startup in development.
 */
export async function ensureDemoAccounts(): Promise<void> {
  if (!isDemoEnvironment()) return;

  for (const [email, role] of Object.entries(DEMO_ROLE_BY_EMAIL)) {
    try {
      // 1) Ensure the Clerk user exists with the demo password.
      const { data: existing } = await clerkClient.users.getUserList({
        emailAddress: [email],
      });
      let clerkUser = existing[0];
      if (!clerkUser) {
        const names = DEMO_NAME_BY_EMAIL[email]!;
        clerkUser = await clerkClient.users.createUser({
          emailAddress: [email],
          password: DEMO_PASSWORD,
          firstName: names.firstName,
          lastName: names.lastName,
          skipPasswordChecks: true,
        });
        logger.info({ email }, "Created demo Clerk user");
      }

      const name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        DEMO_NAME_BY_EMAIL[email]!.firstName;

      // 2) Ensure a live app_users row with the correct role.
      //    Clean up any stale row for this email tied to a different
      //    (deleted/recreated) Clerk user, then upsert by clerk_user_id.
      await db
        .delete(appUsersTable)
        .where(
          sql`lower(${appUsersTable.email}) = ${email} and ${appUsersTable.clerkUserId} <> ${clerkUser.id}`,
        );

      const [row] = await db
        .select()
        .from(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, clerkUser.id));

      if (!row) {
        await db
          .insert(appUsersTable)
          .values({ clerkUserId: clerkUser.id, email, name, role })
          .onConflictDoNothing({ target: appUsersTable.clerkUserId });
        logger.info({ email, role }, "Created demo app user row");
      } else if (row.role !== role || row.removedAt !== null || row.email?.toLowerCase() !== email) {
        await db
          .update(appUsersTable)
          .set({ role, removedAt: null, email })
          .where(eq(appUsersTable.id, row.id));
        logger.info({ email, role }, "Repaired demo app user row");
      }
    } catch (err) {
      logger.error({ err, email }, "Failed to provision demo account");
    }
  }
}
