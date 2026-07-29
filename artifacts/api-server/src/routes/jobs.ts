import { Router, type IRouter } from "express";
import { eq, and, ilike, gte, lte, or, sql, asc } from "drizzle-orm";
import {
  db,
  jobsTable,
  POST_SOLD_STAGES,
  JOB_STAGES,
  type Job,
  type JobStage,
} from "@workspace/db";
import {
  ListJobsQueryParams,
  ListJobsResponse,
  CreateJobBody,
  CreateJobResponse,
  GetJobParams,
  GetJobResponse,
  UpdateJobParams,
  UpdateJobBody,
  UpdateJobResponse,
  DeleteJobParams,
  MoveJobStageParams,
  MoveJobStageBody,
  MoveJobStageResponse,
  GetBoardSummaryResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function toApi(job: Job) {
  return {
    ...job,
    contractAmount:
      job.contractAmount == null ? null : Number(job.contractAmount),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** estimatedInstallDate ascending, nulls last, then customer name. */
const installDateOrder = [
  sql`${jobsTable.estimatedInstallDate} ASC NULLS LAST`,
  asc(jobsTable.customerName),
];

function requiresInstallDate(stage: JobStage): boolean {
  return POST_SOLD_STAGES.includes(stage);
}

router.get("/jobs", requireUser, async (req, res): Promise<void> => {
  const query = ListJobsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { stage, city, coverType, dateFrom, dateTo, search } = query.data;

  const conditions = [];
  if (stage) conditions.push(eq(jobsTable.stage, stage));
  if (city) conditions.push(ilike(jobsTable.city, city));
  if (coverType) conditions.push(ilike(jobsTable.coverType, coverType));
  if (dateFrom) conditions.push(gte(jobsTable.estimatedInstallDate, dateFrom));
  if (dateTo) conditions.push(lte(jobsTable.estimatedInstallDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(jobsTable.customerName, pattern),
        ilike(jobsTable.address, pattern),
        ilike(jobsTable.city, pattern),
      ),
    );
  }

  const jobs = await db
    .select()
    .from(jobsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...installDateOrder);

  res.json(ListJobsResponse.parse(jobs.map(toApi)));
});

router.post("/jobs", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const stage = (data.stage ?? "new_lead") as JobStage;

  if (requiresInstallDate(stage) && !data.estimatedInstallDate) {
    res.status(400).json({
      error: "An Estimated Installation Date is required for Sold jobs",
    });
    return;
  }

  const [job] = await db
    .insert(jobsTable)
    .values({
      ...data,
      stage,
      contractAmount:
        data.contractAmount == null ? null : String(data.contractAmount),
    })
    .returning();

  res.status(201).json(CreateJobResponse.parse(toApi(job)));
});

router.get("/jobs/export", requireUser, async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .orderBy(...installDateOrder);

  const stageLabels: Record<string, string> = {
    new_lead: "New Lead",
    scheduled: "Scheduled",
    bid_given: "Bid Given",
    sold: "Sold",
    invoiced_with_quickbooks: "Invoiced with QuickBooks",
    deposit_paid: "Deposit Paid",
    pre_order_site_visit: "Pre Order Site Visit",
    material_ordered: "Material Ordered",
    non_standard_material_ordered: "Non Standard Material Ordered",
    permit_applied: "Permit Applied",
    footings_needed: "Footings Needed",
    other_prep_work: "Other Prep Work",
    material_received: "Material Received",
    ready_to_install: "Ready to Install",
    installed: "Installed",
    post_install_follow_up: "Post Install Follow up",
    review_asked: "Google Review or referral Asked for",
  };

  const header = [
    "Customer Name",
    "Phone",
    "Address",
    "City",
    "Type of Cover",
    "Contract Amount",
    "Source",
    "Estimated Installation Date",
    "Stage",
    "Invoiced with QB",
    "Deposit Paid",
    "Ordered",
    "Received",
    "Last Note",
  ];

  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = jobs.map((j) =>
    [
      j.customerName,
      j.phone,
      j.address,
      j.city,
      j.coverType,
      j.contractAmount == null ? "" : Number(j.contractAmount).toFixed(2),
      j.source,
      j.estimatedInstallDate,
      stageLabels[j.stage] ?? j.stage,
      j.invoicedWithQb ? "Yes" : "No",
      j.depositPaid ? "Yes" : "No",
      j.materialOrdered ? "Yes" : "No",
      j.materialReceived ? "Yes" : "No",
      j.lastNote,
    ]
      .map(escape)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="superior-patio-jobs.csv"',
  );
  res.send(csv);
});

router.get("/jobs/:id", requireUser, async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(toApi(job)));
});

router.patch("/jobs/:id", requireUser, async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const role = req.appUser!.role;
  const data = parsed.data;

  if (role === "viewer") {
    res.status(403).json({ error: "View-only access" });
    return;
  }
  if (role === "tech") {
    const attempted = Object.keys(data);
    const allowed = ["lastNote"];
    if (attempted.some((k) => !allowed.includes(k))) {
      res
        .status(403)
        .json({ error: "Install techs can only update the note" });
      return;
    }
  }

  const [existing] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Cannot clear the install date on a post-Sold job.
  if (
    "estimatedInstallDate" in data &&
    data.estimatedInstallDate == null &&
    requiresInstallDate(existing.stage as JobStage)
  ) {
    res.status(400).json({
      error: "Sold jobs must keep an Estimated Installation Date",
    });
    return;
  }

  const { contractAmount, ...rest } = data;
  const [job] = await db
    .update(jobsTable)
    .set({
      ...rest,
      ...(contractAmount !== undefined
        ? {
            contractAmount:
              contractAmount == null ? null : String(contractAmount),
          }
        : {}),
    })
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  res.json(UpdateJobResponse.parse(toApi(job)));
});

router.delete(
  "/jobs/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteJobParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [job] = await db
      .delete(jobsTable)
      .where(eq(jobsTable.id, params.data.id))
      .returning();

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.sendStatus(204);
  },
);

router.patch("/jobs/:id/stage", requireUser, async (req, res): Promise<void> => {
  const params = MoveJobStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = MoveJobStageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const role = req.appUser!.role;
  if (role === "viewer") {
    res.status(403).json({ error: "View-only access" });
    return;
  }
  const targetStage = body.data.stage as JobStage;
  if (role === "tech" && targetStage !== "installed") {
    res
      .status(403)
      .json({ error: "Install techs can only move jobs to Installed" });
    return;
  }

  const [existing] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const newDate = body.data.estimatedInstallDate ?? undefined;
  const effectiveDate = newDate ?? existing.estimatedInstallDate;

  if (requiresInstallDate(targetStage) && !effectiveDate) {
    res.status(400).json({
      error:
        "An Estimated Installation Date is required when moving a job to Sold",
    });
    return;
  }

  const [job] = await db
    .update(jobsTable)
    .set({
      stage: targetStage,
      ...(newDate ? { estimatedInstallDate: newDate } : {}),
    })
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  res.json(MoveJobStageResponse.parse(toApi(job)));
});

router.get("/summary", requireUser, async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .orderBy(...installDateOrder);

  const byStage = JOB_STAGES.map((stage) => {
    const inStage = jobs.filter((j) => j.stage === stage);
    return {
      stage,
      count: inStage.length,
      contractTotal: inStage.reduce(
        (sum, j) => sum + (j.contractAmount ? Number(j.contractAmount) : 0),
        0,
      ),
    };
  });

  const today = new Date();
  const in14 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().slice(0, 10);
  const in14Str = in14.toISOString().slice(0, 10);

  const notYetInstalled = (stage: string) =>
    JOB_STAGES.indexOf(stage as JobStage) < JOB_STAGES.indexOf("installed");

  const upcoming = jobs.filter(
    (j) =>
      j.estimatedInstallDate &&
      j.estimatedInstallDate >= todayStr &&
      notYetInstalled(j.stage),
  );

  res.json(
    GetBoardSummaryResponse.parse({
      totalJobs: jobs.length,
      totalContractValue: jobs.reduce(
        (sum, j) => sum + (j.contractAmount ? Number(j.contractAmount) : 0),
        0,
      ),
      installsNext14Days: upcoming.filter(
        (j) => j.estimatedInstallDate! <= in14Str,
      ).length,
      byStage,
      upcomingInstalls: upcoming.slice(0, 5).map(toApi),
    }),
  );
});

export default router;
