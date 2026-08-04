import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { SALES_STAGES, STAGE_LABELS } from "@/lib/utils";
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

export default function SalesPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const salesJobs = React.useMemo<Job[]>(
    () =>
      (jobs || []).filter(job =>
        (SALES_STAGES as readonly string[]).includes(job.stage)
      ),
    [jobs]
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
            {salesJobs.length} leads
          </p>
        </div>

        {user?.role === "admin" && (
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
            <Plus className="w-4 h-4 mr-1.5" />
            New Lead
          </Button>
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
