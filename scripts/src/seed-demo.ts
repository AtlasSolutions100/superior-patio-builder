/**
 * Fills an empty database with believable demo content for a walkthrough:
 * leads across the sales pipeline and jobs across the job board, with notes,
 * crew assignments, and install dates spread around today so the board looks
 * live (a couple overdue, several this week, some further out).
 *
 *   pnpm --filter @workspace/scripts run seed:demo
 *   pnpm --filter @workspace/scripts run seed:demo -- --force   (seed anyway)
 *
 * Safe by design: refuses to run when the database already holds jobs unless
 * --force is passed. Every record is fictional and is removed by
 * `pnpm --filter @workspace/scripts run purge:demo -- --confirm`.
 */
import {
  db,
  pool,
  jobsTable,
  jobNotesTable,
  jobAssignmentsTable,
  stagesTable,
  appUsersTable,
} from "@workspace/db";
import { asc, eq, isNull, sql } from "drizzle-orm";

const force = process.argv.includes("--force");

/** YYYY-MM-DD, `days` from today (negative = past). */
function day(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DemoJob {
  customerName: string;
  phone: string;
  address: string;
  city: string;
  coverType: string;
  contractAmount: string;
  source: string;
  /** Days from today for the estimated install date. */
  installIn: number;
  /** Position in the job pipeline, 0 = first stage. Clamped to what exists. */
  stageIndex: number;
  note: string;
  invoicedWithQb?: boolean;
  depositPaid?: boolean;
  materialOrdered?: boolean;
  materialReceived?: boolean;
}

const DEMO_JOBS: DemoJob[] = [
  { customerName: "Mark & Susan Hollister", phone: "(208) 731-4482", address: "1442 Falls Ave E", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "12450.00", source: "Google Ads", installIn: -3, stageIndex: 10, note: "Crew scheduled Monday, homeowner confirmed. Gate code 4417.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Ray & Donna Pearce", phone: "(208) 736-5540", address: "2210 Candleridge Dr", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "14300.00", source: "Referral", installIn: -1, stageIndex: 7, note: "Two footings on the east side — call before the dig.", invoicedWithQb: true, depositPaid: true, materialOrdered: true },
  { customerName: "Denny Albertson", phone: "(208) 420-9917", address: "318 Madrona St", city: "Twin Falls", coverType: "Lattice Pergola", contractAmount: "8200.00", source: "Referral", installIn: 2, stageIndex: 9, note: "Material checked in at the shop.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Karla Jimenez", phone: "(208) 539-2261", address: "905 8th Ave", city: "Buhl", coverType: "Solid Patio Cover", contractAmount: "9750.00", source: "Facebook", installIn: 4, stageIndex: 6, note: "Buhl permit office says 5–7 business days.", invoicedWithQb: true, depositPaid: true, materialOrdered: true },
  { customerName: "Tyler Branch", phone: "(208) 308-7714", address: "441 Pheasant Rd", city: "Kimberly", coverType: "Aluminum Awning", contractAmount: "5600.00", source: "Google Ads", installIn: 6, stageIndex: 4, note: "Ordered last week, ETA the 8th.", invoicedWithQb: true, depositPaid: true, materialOrdered: true },
  { customerName: "Verna Kaufman", phone: "(208) 543-6120", address: "127 Clear Lakes Rd", city: "Buhl", coverType: "StruXure Pergola", contractAmount: "16800.00", source: "Home Show", installIn: 9, stageIndex: 5, note: "Custom 24 ft span — factory confirmed the order.", invoicedWithQb: true, depositPaid: true, materialOrdered: true },
  { customerName: "Joe Stutzman", phone: "(208) 320-4485", address: "1810 Grandview Dr N", city: "Twin Falls", coverType: "Solid Patio Cover", contractAmount: "10100.00", source: "Referral", installIn: 11, stageIndex: 3, note: "Site visit Thursday to confirm final measurements.", invoicedWithQb: true, depositPaid: true },
  { customerName: "Angela Reyes", phone: "(208) 735-2298", address: "634 Borah Ave W", city: "Twin Falls", coverType: "Insulated Patio Cover", contractAmount: "11900.00", source: "Google Ads", installIn: 14, stageIndex: 2, note: "Deposit check cleared.", invoicedWithQb: true, depositPaid: true },
  { customerName: "Bill & Nancy Tolman", phone: "(208) 423-5561", address: "2905 E 3700 N", city: "Kimberly", coverType: "Lattice Pergola", contractAmount: "7400.00", source: "Yard Sign", installIn: 18, stageIndex: 1, note: "Invoice sent, waiting on the deposit.", invoicedWithQb: true },
  { customerName: "Craig Vandenberg", phone: "(208) 837-4419", address: "188 River Rd", city: "Hagerman", coverType: "Solid Patio Cover", contractAmount: "9300.00", source: "Facebook", installIn: 21, stageIndex: 0, note: "Signed at the kitchen table. Wants the bronze frame." },
  { customerName: "Lupe Herrera", phone: "(208) 733-9083", address: "746 Filer Ave", city: "Twin Falls", coverType: "Aluminum Awning", contractAmount: "4900.00", source: "Google Ads", installIn: 25, stageIndex: 8, note: "Old cover tear-off needed before install.", invoicedWithQb: true, depositPaid: true, materialOrdered: true },
  { customerName: "Stan Whitaker", phone: "(208) 326-7752", address: "305 Main St", city: "Filer", coverType: "Insulated Patio Cover", contractAmount: "13250.00", source: "Referral", installIn: -12, stageIndex: 11, note: "Install finished, final walkthrough done.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Meredith Colby", phone: "(208) 734-6617", address: "1520 Heyburn Ave E", city: "Twin Falls", coverType: "Lattice Pergola", contractAmount: "7950.00", source: "Home Show", installIn: -20, stageIndex: 12, note: "Left a voicemail about touch-up paint.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
  { customerName: "Dale & Ruth Ostrander", phone: "(208) 436-2280", address: "812 Oneida St", city: "Rupert", coverType: "Solid Patio Cover", contractAmount: "8800.00", source: "Repeat Customer", installIn: -27, stageIndex: 13, note: "Texted the Google review link — they said they would.", invoicedWithQb: true, depositPaid: true, materialOrdered: true, materialReceived: true },
];

interface DemoLead {
  customerName: string;
  phone: string;
  city: string;
  address?: string;
  source: string;
  /** Position in the sales pipeline, 0 = first stage. */
  stageIndex: number;
  note: string;
  /** Days ago the lead came in. */
  ageDays: number;
}

const DEMO_LEADS: DemoLead[] = [
  { customerName: "Aaron Gleason", phone: "(208) 514-8099", city: "Kuna", source: "Facebook", stageIndex: 0, note: "Had to cancel the appointment — said to check back next month.", ageDays: 1 },
  { customerName: "Priya Raman", phone: "(208) 861-2244", city: "Boise", address: "4420 W Ustick Rd", source: "Website", stageIndex: 0, note: "Product: StruXure Pergola. Wants a quote for a 16x20.", ageDays: 2 },
  { customerName: "Dustin Hoyle", phone: "(208) 490-7731", city: "Jerome", source: "Google Ads", stageIndex: 0, note: "Asked about financing options.", ageDays: 3 },
  { customerName: "Marta Quintero", phone: "(208) 358-1140", city: "Twin Falls", address: "663 Sarah Ave", source: "Google Ads", stageIndex: 0, note: "Wants shade over an existing concrete slab.", ageDays: 5 },
  { customerName: "Gerald Pettit", phone: "(208) 219-6634", city: "Wendell", source: "Yard Sign", stageIndex: 0, note: "Saw the truck on 3rd Ave.", ageDays: 8 },
  { customerName: "Nina Halverson", phone: "(208) 720-4418", city: "Hailey", source: "Website", stageIndex: 1, note: "Appointment set for Tuesday 2pm.", ageDays: 6 },
  { customerName: "Curtis Bradbury", phone: "(208) 731-9902", city: "Twin Falls", address: "1109 Locust St N", source: "Referral", stageIndex: 1, note: "Meeting at the house Thursday morning.", ageDays: 9 },
  { customerName: "Rosa Delgado", phone: "(208) 404-5518", city: "Burley", source: "Facebook", stageIndex: 1, note: "Rescheduled from last week — confirmed.", ageDays: 12 },
  { customerName: "Wade Kimball", phone: "(208) 293-3357", city: "Gooding", source: "Home Show", stageIndex: 2, note: "Bid sent for a 14x24 insulated cover. Following up Friday.", ageDays: 11 },
  { customerName: "Shauna Pruitt", phone: "(208) 316-7729", city: "Twin Falls", address: "2255 Elizabeth Blvd", source: "Google Ads", stageIndex: 2, note: "Comparing us against one other bid.", ageDays: 15 },
  { customerName: "Elliot Vance", phone: "(208) 599-2071", city: "Sun Valley", source: "Referral", stageIndex: 2, note: "Bid given for drop shades — waiting on their HOA.", ageDays: 19 },
  { customerName: "Bonnie Alcorn", phone: "(208) 678-4460", city: "Rupert", source: "Repeat Customer", stageIndex: 2, note: "Second patio at the same address. Wants to match the first.", ageDays: 23 },
];

async function main(): Promise<void> {
  const [{ n: existing }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobsTable);
  if (existing > 0 && !force) {
    console.log(
      `The database already has ${existing} job/lead records — not seeding.\n` +
        `Pass --force to add demo records anyway, or clear first with:\n` +
        `  pnpm --filter @workspace/scripts run purge:demo -- --confirm`,
    );
    return;
  }

  const stages = await db
    .select()
    .from(stagesTable)
    .where(isNull(stagesTable.archivedAt))
    .orderBy(asc(stagesTable.position), asc(stagesTable.id));
  const salesStages = stages.filter((s) => s.pipeline === "sales");
  const jobStages = stages.filter((s) => s.pipeline === "job");

  if (salesStages.length === 0 || jobStages.length === 0) {
    console.error(
      "No stages found. Start the API server once so startup migrations seed " +
        "the default stages, then re-run this script.",
    );
    process.exitCode = 1;
    return;
  }

  // Crew to assign jobs to: any non-viewer team member.
  const users = await db
    .select()
    .from(appUsersTable)
    .where(isNull(appUsersTable.removedAt));
  const crew = users.filter((u) => u.role !== "viewer");

  let jobCount = 0;
  let leadCount = 0;

  await db.transaction(async (tx) => {
    for (const j of DEMO_JOBS) {
      const stage = jobStages[Math.min(j.stageIndex, jobStages.length - 1)];
      const [row] = await tx
        .insert(jobsTable)
        .values({
          customerName: j.customerName,
          phone: j.phone,
          address: j.address,
          city: j.city,
          coverType: j.coverType,
          contractAmount: j.contractAmount,
          source: j.source,
          estimatedInstallDate: day(j.installIn),
          stage: stage.key,
          lastNote: j.note,
          invoicedWithQb: !!j.invoicedWithQb,
          depositPaid: !!j.depositPaid,
          materialOrdered: !!j.materialOrdered,
          materialReceived: !!j.materialReceived,
        })
        .returning();
      await tx.insert(jobNotesTable).values({
        jobId: row.id,
        authorName: "Demo data",
        text: j.note,
      });
      // Put a crew member on roughly every other job so "My jobs" has content.
      if (crew.length > 0 && jobCount % 2 === 0) {
        const member = crew[jobCount % crew.length];
        await tx
          .insert(jobAssignmentsTable)
          .values({ jobId: row.id, userId: member.id })
          .onConflictDoNothing();
      }
      jobCount++;
    }

    for (const l of DEMO_LEADS) {
      const stage = salesStages[Math.min(l.stageIndex, salesStages.length - 1)];
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - l.ageDays);
      const [row] = await tx
        .insert(jobsTable)
        .values({
          customerName: l.customerName,
          phone: l.phone,
          address: l.address ?? null,
          city: l.city,
          source: l.source,
          stage: stage.key,
          lastNote: l.note,
          createdAt,
        })
        .returning();
      await tx.insert(jobNotesTable).values({
        jobId: row.id,
        authorName: "Demo data",
        text: l.note,
        createdAt,
      });
      leadCount++;
    }
  });

  const assigned = crew.length > 0 ? Math.ceil(jobCount / 2) : 0;
  console.log(
    `Seeded ${jobCount} jobs across ${jobStages.length} job stages and ` +
      `${leadCount} leads across ${salesStages.length} sales stages.`,
  );
  if (assigned > 0) {
    console.log(`Assigned crew to ${assigned} jobs (from ${crew.length} team members).`);
  } else {
    console.log(
      "No team members found yet, so nothing was assigned — sign in once, then " +
        "re-run with --force if you want crew assignments.",
    );
  }
  console.log(
    "\nAll of it is fictional. Clear it before the client uses the app:\n" +
      "  pnpm --filter @workspace/scripts run purge:demo -- --confirm",
  );
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
