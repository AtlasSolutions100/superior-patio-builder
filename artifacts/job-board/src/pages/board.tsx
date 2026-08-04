import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { STAGE_GROUPS, OPERATIONAL_STAGES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { JobDialog } from "@/components/job-dialog";
import { KanbanBoard } from "@/components/kanban-board";

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  // The main board is operational only — pre-Sold leads live on the
  // Sales Pipeline page.
  const boardJobs = React.useMemo<Job[]>(
    () =>
      (jobs || []).filter(job =>
        (OPERATIONAL_STAGES as readonly string[]).includes(job.stage)
      ),
    [jobs]
  );

  if (error && !jobs) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
        <p className="text-sm font-medium text-destructive">Couldn't load jobs.</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Something went wrong while fetching the board. Your data is safe — try again.
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
          <h1 className="text-xl font-semibold tracking-tight">Job Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {boardJobs.length} active jobs
          </p>
        </div>

        {user?.role === "admin" && (
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
        )}
      </div>

      {error && jobs && (
        <div className="flex-none mx-6 mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Couldn't refresh jobs — the board may be out of date.</span>
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

      <KanbanBoard jobs={boardJobs} groups={STAGE_GROUPS} isLoading={isLoading} />

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
