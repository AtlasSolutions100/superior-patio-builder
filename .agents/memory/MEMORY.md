# Memory Index

- [API client auth](api-client-auth.md) — web app attaches fresh Clerk bearer tokens via setAuthTokenGetter + one 401-retry hook; don't rely on session cookie alone.
- [Composite TS builds](composite-ts-builds.md) — after changing lib/* exports, run `npx tsc -b lib/<pkg>` or dependents' typecheck sees stale .d.ts (phantom "no exported member").
