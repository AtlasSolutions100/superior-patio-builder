---
name: Drizzle correlated subqueries in SELECT fields
description: Column refs interpolated into sql`` fragments used as SELECT fields render unqualified and can silently bind to the subquery's own table.
---

Rule: when embedding a correlated subquery in a drizzle `sql` fragment used as a SELECT field (e.g. `.select({ x: sql\`(SELECT ... WHERE child.fk = ${parentTable.id})\` })`), write the outer column fully qualified as raw SQL (`"parent"."id"`), not via `${parentTable.id}`.

**Why:** In SELECT-field context drizzle renders `${parentTable.id}` as unqualified `"id"`, which resolves to the subquery table's own `id` column — the correlation silently never matches and any COALESCE fallback masks the bug (no error, just wrong data). The same interpolation works fine in WHERE-clause context, so it passes review by analogy.

**How to apply:** Any time a `sql` fragment with a subquery is placed in `.select({...})`, double-check the rendered SQL with `.toSQL()` or hardcode the qualified column name. Symptom to watch for: a COALESCE fallback value being returned for rows that clearly have matching child rows.
