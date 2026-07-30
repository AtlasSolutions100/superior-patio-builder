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

// Must not appear in public breach lists: Clerk rejects pwned passwords at
// sign-in time (form_password_pwned) even when creation skips the check.
const DEMO_PASSWORD = "SuperiorPatio-Demo-2026";

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
  // Hard deny in production regardless of key shape, plus the pk_test gate.
  if (process.env.NODE_ENV === "production") return false;
  return (process.env.CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() in DEMO_ROLE_BY_EMAIL;
}

/**
 * Dev-only: mint a short-lived Clerk sign-in token for a demo account so the
 * sign-in page's one-click demo buttons can use the ticket strategy. Ticket
 * sign-ins bypass Clerk's Client Trust (which forces an email code on
 * password sign-ins from new devices) — exactly what a demo button needs.
 */
export async function createDemoSignInToken(email: string): Promise<string | null> {
  if (!isDemoEnvironment() || !isDemoEmail(email)) return null;
  const { data: users } = await clerkClient.users.getUserList({
    emailAddress: [email.toLowerCase()],
  });
  const user = users[0];
  if (!user) return null;
  const token = await clerkClient.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 60,
  });
  return token.token;
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
      } else {
        // Self-heal the password too: if it drifted (or an old pwned password
        // like "password123" is set), reset it to the current demo password.
        const ok = await clerkClient.users
          .verifyPassword({ userId: clerkUser.id, password: DEMO_PASSWORD })
          .then((r) => r.verified)
          .catch(() => false);
        if (!ok) {
          await clerkClient.users.updateUser(clerkUser.id, {
            password: DEMO_PASSWORD,
            skipPasswordChecks: true,
          });
          logger.info({ email }, "Reset demo Clerk user password");
        }
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
