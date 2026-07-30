---
name: Clerk Client Trust vs one-click logins
description: Why password-based auto-logins break on Clerk and how demo login works here.
---

Clerk enables **Client Trust** on new apps: password sign-ins from a new device return `needs_client_trust` and force an email code. It cannot be disabled via the Backend API (dashboard-only, unavailable on Replit-managed Clerk). Clerk also rejects breached passwords at sign-in (`form_password_pwned`, HTTP 422) — e.g. "password123" — even if creation used `skipPasswordChecks`.

**How to apply:** any one-click/automated login must avoid the password strategy. This app's demo buttons call the dev-only unauthenticated `POST /api/demo-login`, which mints a 60s Clerk sign-in token (BAPI `signInTokens.createSignInToken`), and the client signs in via `signIn.ticket({ ticket })` — ticket sign-ins bypass Client Trust entirely. The endpoint is gated by `NODE_ENV !== "production"` + `pk_test_` key + demo-email allowlist. Demo passwords also self-heal at API startup (verify → reset).
