import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "No date";
  try {
    return format(parseISO(dateString), "MMM d, yyyy");
  } catch (e) {
    return dateString;
  }
}

// Matches the API's ordering rule: estimatedInstallDate ascending with
// undated jobs last, tie-broken by customer name.
export function sortByInstallDate<
  T extends { estimatedInstallDate?: string | null; customerName: string },
>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    const ad = a.estimatedInstallDate;
    const bd = b.estimatedInstallDate;
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return a.customerName.localeCompare(b.customerName);
  });
}

// Stage lists and labels are data now — see hooks/use-stages.ts (GET /stages).

/** "Denzil Lloyd" -> "DL", "Justin" -> "J". For assignee chips. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
