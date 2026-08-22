import { clerkClient } from "@clerk/express";

/** Outcome of attempting to send an invitation email. */
export type InviteEmailResult = { sent: true } | { sent: false; error: string };

/**
 * The URL invitees land on from the invitation email. On Replit,
 * REPLIT_DOMAINS holds the domain the app is currently served from
 * (the .replit.dev domain in development, the published domain in
 * production).
 */
function getAppUrl(): string | null {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN?.trim();
  return domain ? `https://${domain}/` : null;
}

/**
 * Extracts a human-readable reason from a Clerk API error, mapping the
 * common failure codes to messages an admin can act on.
 */
function clerkErrorMessage(err: unknown): string {
  const first = (err as { errors?: Array<{ code?: string; message?: string; longMessage?: string }> })
    ?.errors?.[0];
  if (first?.code === "form_identifier_exists" || first?.code === "identifier_already_exists") {
    return "They already have an account — they can sign in directly with this email";
  }
  return (
    first?.longMessage ||
    first?.message ||
    (err instanceof Error ? err.message : "Unknown error")
  );
}

/**
 * Sends an invitation email via Clerk so the invitee learns they have
 * access. Never throws: the invite record must stand even when the email
 * fails, so failures are returned as data for the caller to surface.
 */
export async function sendInviteEmail(
  email: string,
  role: string,
): Promise<InviteEmailResult> {
  try {
    const redirectUrl = getAppUrl();
    await clerkClient.invitations.createInvitation({
      emailAddress: email,
      ...(redirectUrl ? { redirectUrl } : {}),
      // Recorded on the invitation (and copied to the user at signup) so
      // the assigned role travels with the invite.
      publicMetadata: { role },
      notify: true,
      // A previously-revoked or still-pending Clerk invitation for this
      // email must not block re-inviting from the Team page.
      ignoreExisting: true,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: clerkErrorMessage(err) };
  }
}
