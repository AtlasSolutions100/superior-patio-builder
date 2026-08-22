/**
 * Helpers for sharing the app's own URL (e.g. "Copy app link" in the invite
 * flow, since no invitation email is sent).
 *
 * URL resolution order:
 * 1. VITE_APP_URL, when explicitly configured (lets an admin pin a canonical
 *    URL if they ever need to).
 * 2. The app's own origin + base path. In the published app this is the real
 *    production URL — including custom domains — with zero configuration.
 *
 * In a dev build the origin is the temporary .replit.dev preview domain, so
 * `isDevAppLink()` lets the UI warn that the copied link is not permanent.
 */

export function getAppShareUrl(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "") || configured;

  const base = import.meta.env.BASE_URL || "/";
  const url = window.location.origin + base;
  // Drop a trailing slash for a cleaner shareable link (keep it for root).
  return base === "/" ? window.location.origin : url.replace(/\/+$/, "");
}

/** True when the copied link would be a temporary development URL. */
export function isDevAppLink(): boolean {
  if ((import.meta.env.VITE_APP_URL as string | undefined)?.trim()) return false;
  return import.meta.env.DEV;
}

/** Copy text to the clipboard, with a fallback for restricted contexts. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
