import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { STAGE_LABELS, STAGE_GROUPS, PIPELINE_STAGES, sortByInstallDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import JobCard from "@/components/job-card";
import { JobDialog } from "@/components/job-dialog";

const COL_MIN_WIDTH = 240; // px

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [pipelineChoice, setPipelineChoice] = React.useState<boolean | null>(null);

  const jobsByStage = React.useMemo(() => {
    const acc: Record<string, Job[]> = {};
    jobs?.forEach(job => {
      (acc[job.stage] ||= []).push(job);
    });
    return acc;
  }, [jobs]);

  const pipelineJobs = React.useMemo(
    () => PIPELINE_STAGES.flatMap(stage => jobsByStage[stage] || []),
    [jobsByStage]
  );

  // Show the sales pipeline column by default whenever it holds jobs,
  // so no job is ever invisible; the user can still toggle it off.
  const showPipeline = pipelineChoice ?? pipelineJobs.length > 0;

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

  const groups = showPipeline
    ? [{ key: "pipeline", label: "Pipeline", stages: [...PIPELINE_STAGES] }, ...STAGE_GROUPS]
    : STAGE_GROUPS;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-none px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Job Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {jobs?.length || 0} active jobs
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setPipelineChoice(!showPipeline)}
            className={`text-xs px-3 h-8 rounded-full border transition-colors ${
              showPipeline
                ? "border-foreground/20 text-foreground bg-accent/50"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Sales pipeline{pipelineJobs.length > 0 ? ` · ${pipelineJobs.length}` : ""}
          </button>

          {user?.role === "admin" && (
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
              <Plus className="w-4 h-4 mr-1.5" />
              New Job
            </Button>
          )}
        </div>
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

      <div className="flex-1 overflow-x-auto overflow-y-hidden board-scrollbar">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className="grid h-full gap-5 px-6 pb-6 min-w-full w-max"
            style={{
              gridTemplateColumns: `repeat(${groups.length}, minmax(${COL_MIN_WIDTH}px, 1fr))`,
            }}
          >
            {groups.map(group => (
              <GroupColumn
                key={group.key}
                label={group.label}
                jobs={sortByInstallDate(group.stages.flatMap(stage => jobsByStage[stage] || []))}
              />
            ))}
          </div>
        )}
      </div>

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function GroupColumn({ label, jobs }: { label: string; jobs: Job[] }) {
  return (
    <div className="flex flex-col h-full max-h-full min-w-0">
      <div className="flex items-baseline gap-2 mb-3 shrink-0">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{jobs.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-4 pr-0.5">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <div className="h-24 rounded-xl border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground/70">
            No jobs
          </div>
        )}
      </div>
    </div>
  );
}
