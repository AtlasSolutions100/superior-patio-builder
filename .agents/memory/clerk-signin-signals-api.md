---
name: Clerk react useSignIn signals API
description: The @clerk/react version here uses the signals-based sign-in API, not the legacy one.
---

The project's `@clerk/react` exposes the signals-based auth hooks: `useSignIn()` returns `{ signIn, errors, fetchStatus }` — there is **no** `isLoaded`/`setActive`, and `signIn.create()` doesn't exist.

**How to apply:** password sign-in is `const { error } = await signIn.password({ identifier, password })`, then check `signIn.status === "complete"` and call `await signIn.finalize({ navigate: ... })`. Canonical examples live in the clerk-auth skill's custom-ui references (they apply to web too, not just Expo).

Also: demo/seed users created via the Clerk Backend API come out with verified emails, so they sign in without a verification code; use `skipPasswordChecks: true` for simple passwords. Seed scripts should refuse to run unless the secret key starts with `sk_test_`.
