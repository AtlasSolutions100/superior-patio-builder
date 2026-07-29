/**
 * Seeds the database with realistic example jobs for Superior Patio Covers.
 * Idempotent: skips seeding when the jobs table already has rows.
 *
 * Run with: pnpm --filter @workspace/db run seed
 */
import { db } from "./index";
import { jobsTable, type InsertJob } from "./schema/jobs";
import { sql } from "drizzle-orm";

const SEED_JOBS: InsertJob[] = [
  { customerName: "Mark & Susan Hollister", phone: "208-731-4482", address: "1442 Falls Ave E", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "12450.00", source: "Google", estimatedInstallDate: "2026-08-03", stage: "ready_to_install", lastNote: "Crew scheduled for Monday, homeowner confirmed.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Denny Albertson", phone: "208-420-9917", address: "318 Madrona St", city: "Twin Falls", coverType: "Lattice Pergola", contractAmount: "8200.00", source: "Referral", estimatedInstallDate: "2026-08-06", stage: "material_received", lastNote: "Material checked in at shop 7/24.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Karla Jimenez", phone: "208-539-2261", address: "905 8th Ave", city: "Buhl", coverType: "Solid Patio Cover", contractAmount: "9750.00", source: "Facebook", estimatedInstallDate: "2026-08-11", stage: "permit_applied", lastNote: "Buhl permit office says 5-7 business days.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: false },
  { customerName: "Ray & Donna Pearce", phone: "208-736-5540", address: "2210 Candleridge Dr", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "14300.00", source: "Repeat Customer", estimatedInstallDate: "2026-08-14", stage: "footings_needed", lastNote: "Two footings on east side, call before dig done.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: false },
  { customerName: "Tyler Branch", phone: "208-308-7714", address: "441 Pheasant Rd", city: "Kimberly", coverType: "Aluminum Awning", contractAmount: "5600.00", source: "Google", estimatedInstallDate: "2026-08-18", stage: "material_ordered", lastNote: "Ordered 7/20, ETA 8/8.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: false },
  { customerName: "Verna Kaufman", phone: "208-543-6120", address: "127 Clear Lakes Rd", city: "Buhl", coverType: "Non Standard Pergola", contractAmount: "16800.00", source: "Home Show", estimatedInstallDate: "2026-08-21", stage: "non_standard_material_ordered", lastNote: "Custom 24ft span, factory confirmed order.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: false },
  { customerName: "Joe Stutzman", phone: "208-320-4485", address: "1810 Grandview Dr N", city: "Twin Falls", coverType: "Solid Patio Cover", contractAmount: "10100.00", source: "Referral", estimatedInstallDate: "2026-08-25", stage: "pre_order_site_visit", lastNote: "Site visit Thursday to confirm final measurements.", invoicedWithQb: true, depositPaid: true, materialOrdered: false, materialReceived: false },
  { customerName: "Angela Reyes", phone: "208-735-2298", address: "634 Borah Ave W", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "11900.00", source: "Google", estimatedInstallDate: "2026-08-28", stage: "deposit_paid", lastNote: "Deposit check cleared 7/27.", invoicedWithQb: true, depositPaid: true, materialOrdered: false, materialReceived: false },
  { customerName: "Bill & Nancy Tolman", phone: "208-423-5561", address: "2905 E 3700 N", city: "Kimberly", coverType: "Lattice Pergola", contractAmount: "7400.00", source: "Yard Sign", estimatedInstallDate: "2026-09-02", stage: "invoiced_with_quickbooks", lastNote: "Invoice sent, waiting on deposit.", invoicedWithQb: true, depositPaid: false, materialOrdered: false, materialReceived: false },
  { customerName: "Craig Vandenberg", phone: "208-837-4419", address: "188 River Rd", city: "Hagerman", coverType: "Solid Patio Cover", contractAmount: "9300.00", source: "Facebook", estimatedInstallDate: "2026-09-08", stage: "sold", lastNote: "Signed contract at kitchen table 7/26.", invoicedWithQb: false, depositPaid: false, materialOrdered: false, materialReceived: false },
  { customerName: "Lupe Herrera", phone: "208-733-9083", address: "746 Filer Ave", city: "Twin Falls", coverType: "Aluminum Awning", contractAmount: "4900.00", source: "Google", estimatedInstallDate: "2026-09-15", stage: "other_prep_work", lastNote: "Old cover tear-off needed before install.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: false },
  { customerName: "Stan Whitaker", phone: "208-326-7752", address: "305 Main St", city: "Filer", coverType: "Insulated Patio Cover", contractAmount: "13250.00", source: "Referral", estimatedInstallDate: "2026-07-22", stage: "installed", lastNote: "Install finished 7/22, final walkthrough done.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Meredith Colby", phone: "208-734-6617", address: "1520 Heyburn Ave E", city: "Twin Falls", coverType: "Lattice Pergola", contractAmount: "7950.00", source: "Home Show", estimatedInstallDate: "2026-07-15", stage: "post_install_follow_up", lastNote: "Left voicemail about touch-up paint.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Dale & Ruth Ostrander", phone: "208-436-2280", address: "812 Oneida St", city: "Rupert", coverType: "Solid Patio Cover", contractAmount: "8800.00", source: "Repeat Customer", estimatedInstallDate: "2026-07-08", stage: "review_asked", lastNote: "Texted Google review link 7/27, they said will do.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
];

async function main(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobsTable);

  if (count > 0) {
    console.log(`jobs table already has ${count} rows; skipping seed.`);
    return;
  }

  await db.insert(jobsTable).values(SEED_JOBS);
  console.log(`Seeded ${SEED_JOBS.length} jobs.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
