import * as React from "react";
import { useListJobs, useGetCurrentUser, Job } from "@workspace/api-client-react";
import { STAGE_LABELS, ALL_STAGES, STICKY_STAGES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import JobCard from "@/components/job-card";
import { JobDialog } from "@/components/job-dialog";

// Column sizing shared between layout and sticky offsets.
const COL_WIDTH = 280; // px, includes internal padding so sticky columns tile with no gaps

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error } = useListJobs();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const jobsByStage = React.useMemo(() => {
    const acc = ALL_STAGES.reduce((map, stage) => {
      map[stage] = [];
      return map;
    }, {} as Record<string, Job[]>);

    if (jobs) {
      jobs.forEach(job => {
        if (acc[job.stage]) {
          acc[job.stage].push(job);
        }
      });
    }
    return acc;
  }, [jobs]);

  if (error) {
    return <div className="p-8 text-destructive">Failed to load jobs.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-none px-4 py-3 md:px-6 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Job Board</h1>
          <p className="text-xs text-muted-foreground">
            {jobs?.length || 0} active jobs across {ALL_STAGES.length} stages
          </p>
        </div>

        {user?.role === "admin" && (
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-9">
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-x-scroll overflow-y-hidden board-scrollbar bg-accent/20">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full w-max py-4">
            {ALL_STAGES.map(stage => {
              const stickyIndex = (STICKY_STAGES as readonly string[]).indexOf(stage);
              return (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  jobs={jobsByStage[stage] || []}
                  stickyLeft={stickyIndex >= 0 ? stickyIndex * COL_WIDTH : undefined}
                />
              );
            })}
            {/* right padding spacer so last column isn't flush against the edge */}
            <div className="w-2 shrink-0" />
          </div>
        )}
      </div>

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function BoardColumn({ stage, jobs, stickyLeft }: { stage: string; jobs: Job[]; stickyLeft?: number }) {
  const isSticky = stickyLeft !== undefined;
  return (
    <div
      className={`flex flex-col shrink-0 h-full max-h-full px-2 ${
        isSticky ? "sticky z-10 bg-secondary border-r border-border shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]" : ""
      }`}
      style={{ width: COL_WIDTH, ...(isSticky ? { left: stickyLeft } : {}) }}
    >
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <h3 className="font-semibold text-sm text-foreground truncate" title={STAGE_LABELS[stage] || stage}>
          {STAGE_LABELS[stage] || stage}
        </h3>
        <div className="text-muted-foreground text-xs font-mono px-1.5 shrink-0">
          {jobs.length}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pb-4 pr-1">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <div className="h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground bg-card/50">
            No jobs
          </div>
        )}
      </div>
    </div>
  );
}
