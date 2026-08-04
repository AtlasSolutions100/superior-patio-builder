/**
 * Light phone-number helpers for US-style numbers.
 * Formatting is forgiving: it never blocks input, it just tidies it.
 */

/** Strip everything except digits (and a leading +). */
export function phoneDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Format a phone value as the user types.
 * - 10 digits          -> (555) 555-1234
 * - 11 digits w/ 1     -> 1 (555) 555-1234
 * - Anything else (short, long, letters, "call after 5") is returned mostly
 *   as-is so we never fight the user.
 */
export function formatPhoneInput(value: string): string {
  if (!value) return value;
  // If the value contains letters or other free-text, leave it alone.
  if (/[a-zA-Z]/.test(value)) return value;

  let digits = phoneDigits(value);
  let prefix = "";
  if (digits.length === 11 && digits.startsWith("1")) {
    prefix = "1 ";
    digits = digits.slice(1);
  }
  if (digits.length > 10) return value; // extension or intl — leave as typed

  if (digits.length <= 3) return prefix + digits;
  if (digits.length <= 6) return `${prefix}(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `${prefix}(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** True when the value looks like a dialable US number (10 digits, or 11 starting with 1). */
export function isLikelyValidPhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/**
 * Build a safe tel: href from whatever is stored.
 * Keeps digits (plus a leading +); returns null when there aren't enough
 * digits to dial (e.g. "call after 5").
 */
export function toTelHref(value: string): string | null {
  const plus = value.trim().startsWith("+") ? "+" : "";
  const digits = phoneDigits(value);
  if (digits.length < 7) return null;
  return `tel:${plus}${digits}`;
}
