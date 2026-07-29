---
name: Composite TS builds
description: Stale .d.ts in lib/* project references breaks dependent typechecks
---

Rule: `lib/*` packages are TypeScript composite projects consumed via project references. After adding/renaming exports in a lib package, rebuild it (`npx tsc -b lib/<pkg>`) before running a dependent artifact's `typecheck`.

**Why:** dependents typecheck against the lib's emitted `.d.ts`, not its source — stale declarations produce phantom errors like "Module has no exported member X" or failed instanceof narrowing even though the source is correct.

**How to apply:** whenever a dependent typecheck errors on a symbol you just added to a lib package, rebuild the lib first instead of debugging the source.
