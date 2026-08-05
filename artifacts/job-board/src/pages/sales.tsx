import * as React from "react";
import {
  useListJobs,
  useGetCurrentUser,
  useGetLeadSyncStatus,
  useRunLeadSync,
  Job,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SALES_STAGES, PIPELINE_STAGES, STAGE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { JobDialog } from "@/components/job-dialog";
import { KanbanBoard, BoardGroup } from "@/components/kanban-board";

// Four single-stage columns: New Lead → Scheduled → Bid Given → Sold.
// Sold also appears on the main Job Board — same jobs, both views.
const SALES_GROUPS: BoardGroup[] = SALES_STAGES.map(stage => ({
  key: stage,
  label: STAGE_LABELS[stage] || stage,
  stages: [stage],
}));

function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SalesPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();
  const isAdmin = user?.role === "admin";

  const queryClient = useQueryClient();
  const { data: syncStatus } = useGetLeadSyncStatus({
    query: {
      queryKey: ["lead-sync-status"],
      enabled: isAdmin,
      refetchInterval: 60_000,
    },
  });
  const runSync = useRunLeadSync({
    mutation: {
      onSuccess: () => {
        // New leads may have been created — refresh both.
        void queryClient.invalidateQueries();
      },
    },
  });

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const salesJobs = React.useMemo<Job[]>(
    () =>
      (jobs || []).filter(job =>
        (SALES_STAGES as readonly string[]).includes(job.stage)
      ),
    [jobs]
  );

  // Header counts active leads only — Sold jobs are converted, not leads.
  const activeLeadCount = React.useMemo(
    () =>
      salesJobs.filter(job =>
        (PIPELINE_STAGES as readonly string[]).includes(job.stage)
      ).length,
    [salesJobs]
  );

  if (error && !jobs) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
        <p className="text-sm font-medium text-destructive">Couldn't load leads.</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Something went wrong while fetching the pipeline. Your data is safe — try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-none px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeLeadCount} active {activeLeadCount === 1 ? "lead" : "leads"}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {syncStatus?.lastError ? (
                <span
                  className="inline-flex items-center gap-1 text-destructive"
                  title={syncStatus.lastError}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Sheet sync failed
                  {syncStatus.lastSyncedAt &&
                    ` — last synced ${formatSyncedAt(syncStatus.lastSyncedAt)}`}
                </span>
              ) : syncStatus?.lastSyncedAt ? (
                <span>Sheet synced {formatSyncedAt(syncStatus.lastSyncedAt)}</span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => runSync.mutate()}
                disabled={runSync.isPending || syncStatus?.running}
              >
                {runSync.isPending || syncStatus?.running ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Sync now
              </Button>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
              <Plus className="w-4 h-4 mr-1.5" />
              New Lead
            </Button>
          </div>
        )}
      </div>

      {error && jobs && (
        <div className="flex-none mx-6 mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Couldn't refresh leads — the pipeline may be out of date.</span>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
          >
            {isRefetching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Retry
          </button>
        </div>
      )}

      <KanbanBoard jobs={salesJobs} groups={SALES_GROUPS} isLoading={isLoading} cardVariant="lead" />

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
