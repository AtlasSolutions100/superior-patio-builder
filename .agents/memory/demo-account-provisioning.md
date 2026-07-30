---
name: Demo account provisioning
description: Dev-only demo logins are self-healing on API server startup
---
The three demo logins (admin/tech/viewer @demo.com, password123) are provisioned idempotently on API server startup, gated on a `pk_test_` Clerk publishable key (same gate as the sign-in page's demo buttons).

**Why:** the app_users rows were once lost during account-removal work, silently breaking the demo buttons. Just-in-time provisioning in auth middleware alone isn't enough because a soft-deleted (removedAt) row blocks sign-in with 403.

**How to apply:** don't hand-seed demo users; restart the API server instead. Demo accounts are also protected from Team-page removal (server guard + hidden UI) in dev. Note: role *edits* to demo accounts still drift until the next server restart repairs them.
