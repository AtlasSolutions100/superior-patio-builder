import * as React from "react";
import {
  useListStages,
  getListStagesQueryKey,
  type Stage,
} from "@workspace/api-client-react";

/**
 * The app's single source of truth for pipeline stages (admin-editable via
 * Settings). Wraps GET /stages with a long-ish stale time — stage edits
 * invalidate the query, so everything re-renders with the new list at once.
 *
 * Sales pipeline = leads; job pipeline = the Job Board. Moving a job into the
 * job pipeline requires an Estimated Install Date (enforced by the API).
 */
export function useStages() {
  const query = useListStages({
    query: {
      queryKey: getListStagesQueryKey(),
      staleTime: 60_000,
    },
  });

  const stages = React.useMemo<Stage[]>(() => query.data ?? [], [query.data]);

  return React.useMemo(() => {
    const salesStages = stages.filter((s) => s.pipeline === "sales");
    const jobStages = stages.filter((s) => s.pipeline === "job");
    const byKey = new Map(stages.map((s) => [s.key, s]));
    const labels: Record<string, string> = {};
    for (const s of stages) labels[s.key] = s.label;

    return {
      isLoading: query.isLoading,
      error: query.error,
      stages,
      salesStages,
      jobStages,
      byKey,
      labels,
      /** Label lookup that degrades to the raw key for removed stages. */
      labelOf: (key: string) => byKey.get(key)?.label ?? labels[key] ?? key,
      isJobStage: (key: string) => byKey.get(key)?.pipeline === "job",
      isSalesStage: (key: string) => byKey.get(key)?.pipeline === "sales",
      /** Work finished — not "late" even when the install date has passed. */
      isComplete: (key: string) => byKey.get(key)?.isComplete ?? false,
      /** Where new leads land. */
      entrySalesStage: salesStages[0],
      /** The first Job Board stage — the "Sold" handoff destination. */
      entryJobStage: jobStages[0],
    };
  }, [stages, query.isLoading, query.error]);
}

export type Stages = ReturnType<typeof useStages>;
