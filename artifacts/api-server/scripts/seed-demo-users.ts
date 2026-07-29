/**
 * Seeds verified demo users into the Clerk DEV instance so they can sign in
 * with plain email + password (no verification code). Idempotent — safe to
 * re-run. Only ever run against dev keys (sk_test_...).
 *
 * Run (from artifacts/api-server):
 *   node --experimental-strip-types scripts/seed-demo-users.ts
 * or via the package script: pnpm --filter @workspace/api-server run seed:demo-users
 */
import { createClerkClient } from "@clerk/express";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY is not set");
}
if (!secretKey.startsWith("sk_test_")) {
  throw new Error(
    "Refusing to seed demo users: CLERK_SECRET_KEY is not a development (sk_test_) key.",
  );
}

const clerk = createClerkClient({ secretKey });

const DEMO_USERS = [
  { email: "admin@demo.com", firstName: "Demo", lastName: "Admin" },
  { email: "tech@demo.com", firstName: "Demo", lastName: "Tech" },
  { email: "viewer@demo.com", firstName: "Demo", lastName: "Viewer" },
];
const DEMO_PASSWORD = "password123";

async function main() {
  for (const { email, firstName, lastName } of DEMO_USERS) {
    const existing = await clerk.users.getUserList({ emailAddress: [email] });
    let user = existing.data[0];

    if (!user) {
      user = await clerk.users.createUser({
        emailAddress: [email],
        password: DEMO_PASSWORD,
        firstName,
        lastName,
        skipPasswordChecks: true,
      });
      console.log(`Created ${email} (${user.id})`);
    } else {
      // Ensure the password matches the documented demo password.
      await clerk.users.updateUser(user.id, {
        password: DEMO_PASSWORD,
        skipPasswordChecks: true,
      });
      console.log(`Exists ${email} (${user.id}) — password reset`);
    }

    // Mark the email verified so sign-in never asks for a code.
    const fresh = await clerk.users.getUser(user.id);
    const emailObj = fresh.emailAddresses.find(
      (e) => e.emailAddress === email,
    );
    if (emailObj && emailObj.verification?.status !== "verified") {
      await clerk.emailAddresses.updateEmailAddress(emailObj.id, {
        verified: true,
      });
      console.log(`Verified ${email}`);
    }
  }
  console.log("Demo users seeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
