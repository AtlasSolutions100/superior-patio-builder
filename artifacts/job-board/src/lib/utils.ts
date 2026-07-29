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
  review_asked: 'Google Review or referral Asked for',
};

// Full pipeline, in order. All 17 stages shown on the board.
export const ALL_STAGES = [
  'new_lead', 'scheduled', 'bid_given', 'sold', 'invoiced_with_quickbooks',
  'deposit_paid', 'pre_order_site_visit', 'material_ordered',
  'non_standard_material_ordered', 'permit_applied', 'footings_needed',
  'other_prep_work', 'material_received', 'ready_to_install', 'installed',
  'post_install_follow_up', 'review_asked'
] as const;

// Display-only grouping of the operational pipeline into 6 board columns.
// Jobs always keep their exact underlying stage; this only affects layout.
export const STAGE_GROUPS: { key: string; label: string; stages: string[] }[] = [
  { key: 'sold', label: 'Sold', stages: ['sold'] },
  { key: 'financial', label: 'Financial', stages: ['invoiced_with_quickbooks', 'deposit_paid'] },
  { key: 'ordering', label: 'Ordering', stages: ['pre_order_site_visit', 'material_ordered', 'non_standard_material_ordered'] },
  { key: 'prep', label: 'Prep', stages: ['permit_applied', 'footings_needed', 'other_prep_work', 'material_received'] },
  { key: 'install', label: 'Install', stages: ['ready_to_install', 'installed'] },
  { key: 'followup', label: 'Follow-up', stages: ['post_install_follow_up', 'review_asked'] },
];

// Pre-sold stages shown in the optional sales pipeline column.
export const PIPELINE_STAGES = ['new_lead', 'scheduled', 'bid_given'] as const;

export const SALES_STAGES = [
  'new_lead', 'scheduled', 'bid_given', 'sold'
] as const;

export const OPERATIONAL_STAGES = [
  'sold', 'invoiced_with_quickbooks', 'deposit_paid', 'pre_order_site_visit',
  'material_ordered', 'non_standard_material_ordered', 'permit_applied',
  'footings_needed', 'other_prep_work', 'material_received', 'ready_to_install',
  'installed', 'post_install_follow_up', 'review_asked'
] as const;
