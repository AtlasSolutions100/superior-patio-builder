# Memory Index

- [API client auth](api-client-auth.md) — web app attaches fresh Clerk bearer tokens via setAuthTokenGetter + one 401-retry hook; don't rely on session cookie alone.
- [Clerk signals sign-in API](clerk-signin-signals-api.md) — useSignIn has no isLoaded/setActive; use signIn.password() + finalize(); backend-created users are pre-verified.
- [Demo account provisioning](demo-account-provisioning.md) — demo logins self-heal on API startup (pk_test gate); don't hand-seed; removal is blocked, role edits drift until restart.
- [Clerk Client Trust](clerk-client-trust.md) — password sign-ins trigger device email codes & pwned-password 422s; one-click demo login must use server-minted sign-in tokens + signIn.ticket().
- [Composite TS builds](composite-ts-builds.md) — after changing lib/* exports, run `npx tsc -b lib/<pkg>` or dependents' typecheck sees stale .d.ts (phantom "no exported member").
