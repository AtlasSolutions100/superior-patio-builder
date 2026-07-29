---
name: API client auth
description: How the job-board web app keeps API requests authorized with Clerk
---

Rule: the shared API client (`lib/api-client-react/src/custom-fetch.ts`) supports `setAuthTokenGetter` and `setUnauthorizedRetryHandler`. The job-board web app registers both in `ApiAuthBridge` (App.tsx) using Clerk's `useAuth().getToken` — every request carries a fresh bearer token, and a 401 triggers one `getToken({ skipCache: true })` refresh + retry.

**Why:** Clerk session-token cookies are short-lived (~60s); relying on the cookie alone caused spurious 401s after API-server restarts/idle tabs, which the UI silently rendered as "0 jobs". React-query is also configured (job-board query-client) to not retry 401/403 since the fetch layer already retried with a fresh token.

**How to apply:** any new frontend consuming `@workspace/api-client-react` with Clerk should register the same bridge; never render a failed fetch as an empty list — surface error + retry.
