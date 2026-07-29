import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { STAGE_LABELS, STAGE_GROUPS, PIPELINE_STAGES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import JobCard from "@/components/job-card";
import { JobDialog } from "@/components/job-dialog";

const COL_MIN_WIDTH = 240; // px

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error } = useListJobs();

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

  if (error) {
    return <div className="p-8 text-destructive">Failed to load jobs.</div>;
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
                jobs={group.stages.flatMap(stage => jobsByStage[stage] || [])}
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
