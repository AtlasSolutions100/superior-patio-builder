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

export const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  scheduled: 'Scheduled',
  bid_given: 'Bid Given',
  sold: 'Sold',
  invoiced_with_quickbooks: 'Invoiced with QuickBooks',
  deposit_paid: 'Deposit Paid',
  pre_order_site_visit: 'Pre Order Site Visit',
  material_ordered: 'Material Ordered',
  non_standard_material_ordered: 'Non Standard Material Ordered',
  permit_applied: 'Permit Applied',
  footings_needed: 'Footings Needed',
  other_prep_work: 'Other Prep Work',
  material_received: 'Material Received',
  ready_to_install: 'Ready to Install',
  installed: 'Installed',
  post_install_follow_up: 'Post Install Follow up',
  review_asked: 'Review Asked',
};

export const SALES_STAGES = [
  'new_lead', 'scheduled', 'bid_given', 'sold'
] as const;

export const OPERATIONAL_STAGES = [
  'sold', 'invoiced_with_quickbooks', 'deposit_paid', 'pre_order_site_visit',
  'material_ordered', 'non_standard_material_ordered', 'permit_applied',
  'footings_needed', 'other_prep_work', 'material_received', 'ready_to_install',
  'installed', 'post_install_follow_up', 'review_asked'
] as const;
