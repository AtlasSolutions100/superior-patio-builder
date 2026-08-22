---
name: GitHub API sync
description: OAuth connector access may not authenticate the local Git CLI; remote commits can still be verified and hydrated through the GitHub API.
---

When GitHub OAuth works through the connector but `git fetch` still rejects credentials, do not ask for a token or expose one. Use the authenticated GitHub API to read the remote commit/tree/blobs and verify every Git object hash before updating local references.

**Why:** The connector authenticates REST calls but does not necessarily configure Git's HTTPS credential flow. GitHub API timestamps are normalized to UTC, while Git object IDs preserve the original timezone offset; reconstructing a commit from normalized metadata can yield a different SHA.

**How to apply:** Prefer normal Git fetch/pull when it is authenticated. If it is not, confirm a clean worktree, retrieve remote objects through the connector, verify blob/tree/commit hashes (including original raw commit metadata when needed), then merge only after exact verification.