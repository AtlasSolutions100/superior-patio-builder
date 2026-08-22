import { asc, isNull, sql } from "drizzle-orm";
import { db, stagesTable, type Stage, type StagePipeline } from "@workspace/db";

/**
 * In-process view of the `stages` table used by every request that needs to
 * reason about a job's stage (install-date gate, tech move rule, lead/job
 * separation, labels). Reloaded after any mutation through this module and
 * refreshed on a short TTL so other instances' edits show up too.
 */

const TTL_MS = 15_000;

let cache: { stages: Stage[]; byKey: Map<string, Stage>; loadedAt: number } | null = null;

export async function loadStages(): Promise<Stage[]> {
  const stages = await db
    .select()
    .from(stagesTable)
    .where(isNull(stagesTable.archivedAt))
    .orderBy(asc(stagesTable.pipeline), asc(stagesTable.position), asc(stagesTable.id));
  cache = { stages, byKey: new Map(stages.map((s) => [s.key, s])), loadedAt: Date.now() };
  return stages;
}

export function invalidateStages(): void {
  cache = null;
}

async function ensure(): Promise<NonNullable<typeof cache>> {
  if (!cache || Date.now() - cache.loadedAt > TTL_MS) await loadStages();
  return cache!;
}

/** Active stages, ordered: sales pipeline first, then job pipeline, by position. */
export async function getStages(): Promise<Stage[]> {
  return (await ensure()).stages;
}

export async function getStage(key: string): Promise<Stage | undefined> {
  return (await ensure()).byKey.get(key);
}

export async function getPipelineStages(pipeline: StagePipeline): Promise<Stage[]> {
  return (await ensure()).stages.filter((s) => s.pipeline === pipeline);
}

export async function stageKeys(pipeline: StagePipeline): Promise<string[]> {
  return (await getPipelineStages(pipeline)).map((s) => s.key);
}

/** Jobs in the job pipeline must carry an Estimated Install Date. */
export async function isJobStage(key: string): Promise<boolean> {
  return (await getStage(key))?.pipeline === "job";
}

export async function isSalesStage(key: string): Promise<boolean> {
  return (await getStage(key))?.pipeline === "sales";
}

/** First stage of a pipeline — where new leads / newly sold jobs land. */
export async function entryStage(pipeline: StagePipeline): Promise<Stage | undefined> {
  return (await getPipelineStages(pipeline))[0];
}

export async function stageLabel(key: string): Promise<string> {
  return (await getStage(key))?.label ?? key;
}

/** Labels for every stage including archived ones (for exports/history). */
export async function allStageLabels(): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: stagesTable.key, label: stagesTable.label })
    .from(stagesTable);
  return Object.fromEntries(rows.map((r) => [r.key, r.label]));
}

/** Active job count per stage key (archived jobs excluded). */
export async function jobCountsByStage(): Promise<Record<string, number>> {
  const rows = await db.execute<{ stage: string; count: number }>(
    sql`SELECT stage, count(*)::int AS count FROM jobs WHERE archived_at IS NULL GROUP BY stage`,
  );
  return Object.fromEntries(rows.rows.map((r) => [r.stage, r.count]));
}

/** Turn a label into a stable key: "Waiting for delivery" -> "waiting_for_delivery". */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "stage";
}

