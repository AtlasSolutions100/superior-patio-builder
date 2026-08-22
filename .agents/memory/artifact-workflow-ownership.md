---
name: Artifact workflow ownership
description: Avoid duplicate service processes after imported artifact registration.
---

When an imported project’s artifact metadata becomes registered after temporary
manual workflows were created, remove the manual workflows before using the
artifact-owned workflows.

**Why:** Both workflow types can start the same command on the same assigned
port, causing `EADDRINUSE` and leaving the artifact service marked as failed
even though the application itself is valid.

**How to apply:** Prefer the exact `artifacts/<slug>: <service>` workflow as
soon as it exists. If a prior manual workflow targeted the same frontend or API,
remove it and stop any leftover process before restarting the managed service.