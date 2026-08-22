---
name: Clerk invitation emails
description: How invite notification emails are sent via Clerk's Backend API and their quirks.
---

Invitation emails are sent with Clerk's Backend API (`clerkClient.invitations.createInvitation`) — no separate email provider is connected to this project.

Key behaviors observed on the dev (pk_test) instance:

- `redirectUrl` should be `https://` + first entry of `REPLIT_DOMAINS` (dev domain in workspace, published domain in deployments); the emailed button links there via a Clerk ticket URL.
- Pass `ignoreExisting: true` or a previously pending/revoked Clerk invitation for the same email blocks re-invites.
- Inviting an email that already has a Clerk **user** succeeds on the dev instance (no `form_identifier_exists` error) — don't rely on Clerk to reject existing accounts; the app's own 409 member check must run first.
- The email body is Clerk's fixed template (app name + join button); the assigned role can only ride along in `publicMetadata`, not the visible email text.

**How to apply:** email sends must never fail the invite record — return the failure as data (`emailSent`/`emailError` on the 201) and surface it to the admin. Duplicate/409 paths must return before any send.
