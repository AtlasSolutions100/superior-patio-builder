import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { useStages } from "@/hooks/use-stages";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { JobDialog } from "@/components/job-dialog";
import { KanbanBoard, BoardGroup } from "@/components/kanban-board";

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();
  const stg = useStages();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  // "My jobs" — techs default to seeing only the jobs assigned to them.
  const [myJobsOnly, setMyJobsOnly] = React.useState(false);
  const [myJobsInitFor, setMyJobsInitFor] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!user || myJobsInitFor === user.id) return;
    const saved = localStorage.getItem(`spc-myjobs:${user.id}`);
    setMyJobsOnly(saved != null ? saved === "1" : user.role === "tech");
    setMyJobsInitFor(user.id);
  }, [user, myJobsInitFor]);
  const toggleMyJobs = () => {
    setMyJobsOnly(v => {
      const nv = !v;
      if (user) localStorage.setItem(`spc-myjobs:${user.id}`, nv ? "1" : "0");
      return nv;
    });
  };

  // One column per job-pipeline stage, in the order set on the Settings page.
  const groups = React.useMemo<BoardGroup[]>(
    () =>
      stg.jobStages.map(stage => ({
        key: stage.key,
        label: stage.label,
        stages: [stage.key],
      })),
    [stg.jobStages]
  );

  // The main board is operational only — leads live on the Sales Pipeline page.
  const boardJobs = React.useMemo<Job[]>(
    () =>
      (jobs || []).filter(
        job =>
          stg.isJobStage(job.stage) &&
          (!myJobsOnly || job.assignees?.some(a => a.id === user?.id))
      ),
    [jobs, stg, myJobsOnly, user?.id]
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
      <div className="flex-none px-4 md:px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Job Board</h1>
            {user?.role === "viewer" && (
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5"
                title="You can browse the board — admins and techs move jobs."
              >
                View only
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {boardJobs.length} {myJobsOnly ? "of your" : "active"} jobs
          </p>
        </div>

        {user && user.role !== "viewer" && (
          <button
            type="button"
            onClick={toggleMyJobs}
            className={`text-xs px-3 h-8 rounded-full border transition-colors inline-flex items-center gap-1.5 shrink-0 ${
              myJobsOnly
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title="Show only jobs assigned to you"
          >
            My jobs
          </button>
        )}

        {user?.role === "admin" && (
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
        )}
      </div>

      {error && jobs && (
        <div className="flex-none mx-4 md:mx-6 mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
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

      <KanbanBoard
        jobs={boardJobs}
        groups={groups}
        isLoading={isLoading || stg.isLoading}
        emptyLabel="No jobs in this stage"
      />

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
