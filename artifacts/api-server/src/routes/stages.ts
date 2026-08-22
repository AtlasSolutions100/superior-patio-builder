import { Router, type IRouter } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, jobsTable, stagesTable, type Stage } from "@workspace/db";
import {
  ListStagesResponse,
  CreateStageBody,
  CreateStageResponse,
  UpdateStageParams,
  UpdateStageBody,
  UpdateStageResponse,
  RemoveStageParams,
  RemoveStageBody,
  ReorderStagesBody,
  ReorderStagesResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";
import {
  getStages,
  invalidateStages,
  jobCountsByStage,
  loadStages,
  slugify,
} from "../lib/stages";

const router: IRouter = Router();

function toApi(stage: Stage, counts: Record<string, number>) {
  return {
    id: stage.id,
    key: stage.key,
    label: stage.label,
    pipeline: stage.pipeline as "sales" | "job",
    position: stage.position,
    techCanMove: stage.techCanMove,
    isComplete: stage.isComplete,
    jobCount: counts[stage.key] ?? 0,
  };
}

async function listWithCounts() {
  const [stages, counts] = await Promise.all([getStages(), jobCountsByStage()]);
  return stages.map((s) => toApi(s, counts));
}

router.get("/stages", requireUser, async (_req, res): Promise<void> => {
  res.json(ListStagesResponse.parse(await listWithCounts()));
});

router.post("/stages", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const body = CreateStageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a stage name and pipeline" });
    return;
  }
  const label = body.data.label.trim();
  if (!label) {
    res.status(400).json({ error: "Stage name cannot be empty" });
    return;
  }
  const { pipeline, afterKey } = body.data;
  const base = slugify(label);

  const created = await db.transaction(async (tx) => {
    const siblings = await tx
      .select()
      .from(stagesTable)
      .where(and(eq(stagesTable.pipeline, pipeline), isNull(stagesTable.archivedAt)))
      .orderBy(asc(stagesTable.position), asc(stagesTable.id));

    if (siblings.some((s) => s.label.trim().toLowerCase() === label.toLowerCase())) {
      return { error: `A stage named "${label}" already exists in this pipeline` };
    }

    // Where does it go? After `afterKey`, else at the end.
    let insertAt = siblings.length;
    if (afterKey) {
      const idx = siblings.findIndex((s) => s.key === afterKey);
      if (idx === -1) return { error: "afterKey is not a stage in this pipeline" };
      insertAt = idx + 1;
    }

    // Re-adding a stage that was removed earlier revives its row so its key
    // (and any history referencing it) stays the same.
    const [archived] = await tx
      .select()
      .from(stagesTable)
      .where(and(eq(stagesTable.key, base), sql`${stagesTable.archivedAt} IS NOT NULL`));

    let key = base;
    if (!archived) {
      // Ensure key uniqueness among all rows (active or archived).
      const taken = new Set(
        (await tx.select({ key: stagesTable.key }).from(stagesTable)).map((r) => r.key),
      );
      let n = 2;
      while (taken.has(key)) key = `${base}_${n++}`;
    }

    // Renumber siblings to open a slot, then insert/revive.
    const ordered = [...siblings];
    const placeholder = { id: -1 } as Stage;
    ordered.splice(insertAt, 0, placeholder);
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].id === -1) continue;
      await tx
        .update(stagesTable)
        .set({ position: i + 1 })
        .where(eq(stagesTable.id, ordered[i].id));
    }
    const position = insertAt + 1;

    let row: Stage;
    if (archived) {
      [row] = await tx
        .update(stagesTable)
        .set({
          label,
          pipeline,
          position,
          techCanMove: body.data.techCanMove ?? archived.techCanMove,
          isComplete: body.data.isComplete ?? archived.isComplete,
          archivedAt: null,
        })
        .where(eq(stagesTable.id, archived.id))
        .returning();
    } else {
      [row] = await tx
        .insert(stagesTable)
        .values({
          key,
          label,
          pipeline,
          position,
          techCanMove: body.data.techCanMove ?? pipeline === "job",
          isComplete: body.data.isComplete ?? false,
        })
        .returning();
    }
    return { row };
  });

  if ("error" in created) {
    res.status(400).json({ error: created.error });
    return;
  }
  invalidateStages();
  const counts = await jobCountsByStage();
  res.status(201).json(CreateStageResponse.parse(toApi(created.row, counts)));
});

router.patch("/stages/:id", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateStageParams.safeParse(req.params);
  const body = UpdateStageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existing] = await db
    .select()
    .from(stagesTable)
    .where(and(eq(stagesTable.id, params.data.id), isNull(stagesTable.archivedAt)));
  if (!existing) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }

  const updates: Partial<Stage> = {};
  if (body.data.label !== undefined) {
    const label = body.data.label.trim();
    if (!label) {
      res.status(400).json({ error: "Stage name cannot be empty" });
      return;
    }
    const clash = (await getStages()).find(
      (s) =>
        s.id !== existing.id &&
        s.pipeline === existing.pipeline &&
        s.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (clash) {
      res.status(400).json({ error: `A stage named "${label}" already exists in this pipeline` });
      return;
    }
    updates.label = label;
  }
  if (body.data.techCanMove !== undefined) updates.techCanMove = body.data.techCanMove;
  if (body.data.isComplete !== undefined) updates.isComplete = body.data.isComplete;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [row] = await db
    .update(stagesTable)
    .set(updates)
    .where(eq(stagesTable.id, existing.id))
    .returning();
  invalidateStages();
  const counts = await jobCountsByStage();
  res.json(UpdateStageResponse.parse(toApi(row, counts)));
});

router.post("/stages/reorder", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const body = ReorderStagesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { pipeline, keys } = body.data;

  const active = (await getStages()).filter((s) => s.pipeline === pipeline);
  const activeKeys = new Set(active.map((s) => s.key));
  const given = new Set(keys);
  if (
    keys.length !== active.length ||
    given.size !== keys.length ||
    [...activeKeys].some((k) => !given.has(k))
  ) {
    res.status(400).json({
      error: "keys must list every stage in this pipeline exactly once",
    });
    return;
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < keys.length; i++) {
      await tx
        .update(stagesTable)
        .set({ position: i + 1 })
        .where(eq(stagesTable.key, keys[i]));
    }
  });
  invalidateStages();
  res.json(ReorderStagesResponse.parse(await listWithCounts()));
});

router.post(
  "/stages/:id/remove",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = RemoveStageParams.safeParse(req.params);
    const body = RemoveStageBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const moveTo = body.data.moveTo ?? null;

    const [target] = await db
      .select()
      .from(stagesTable)
      .where(and(eq(stagesTable.id, params.data.id), isNull(stagesTable.archivedAt)));
    if (!target) {
      res.status(404).json({ error: "Stage not found" });
      return;
    }

    const siblings = (await getStages()).filter(
      (s) => s.pipeline === target.pipeline && s.id !== target.id,
    );
    if (siblings.length === 0) {
      res.status(400).json({
        error: "A pipeline needs at least one stage — add another before removing this one",
      });
      return;
    }

    // Jobs (active AND archived) still pointing at this stage must go somewhere.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(eq(jobsTable.stage, target.key));

    let destination: Stage | undefined;
    if (count > 0) {
      destination = moveTo ? siblings.find((s) => s.key === moveTo) : undefined;
      if (!destination) {
        res.status(400).json({
          error: `${count} job${count === 1 ? " is" : "s are"} in "${target.label}" — choose a stage in the same pipeline to move them to first`,
          jobCount: count,
        });
        return;
      }
    }

    await db.transaction(async (tx) => {
      if (destination) {
        await tx
          .update(jobsTable)
          .set({ stage: destination.key })
          .where(eq(jobsTable.stage, target.key));
      }
      await tx
        .update(stagesTable)
        .set({ archivedAt: new Date() })
        .where(eq(stagesTable.id, target.id));
      // Close the gap in positions.
      for (let i = 0; i < siblings.length; i++) {
        await tx
          .update(stagesTable)
          .set({ position: i + 1 })
          .where(eq(stagesTable.id, siblings[i].id));
      }
    });
    invalidateStages();
    await loadStages();
    res.status(204).end();
  },
);

export default router;
