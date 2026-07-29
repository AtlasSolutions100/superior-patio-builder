import * as React from "react";
import { useListJobs, useGetCurrentUser, Job, JobStage, JobStageMove, JobUpdate } from "@workspace/api-client-react";
import { STAGE_LABELS, SALES_STAGES, OPERATIONAL_STAGES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, LayoutList, ChevronRight, Check } from "lucide-react";
import JobCard from "@/components/job-card";
import { JobDialog } from "@/components/job-dialog";

export default function BoardPage() {
  const { data: user } = useGetCurrentUser();
  const [view, setView] = React.useState<"operational" | "sales">("operational");
  const { data: jobs, isLoading, error } = useListJobs();
  
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  if (error) {
    return <div className="p-8 text-destructive">Failed to load jobs.</div>;
  }

  const columns = view === "operational" ? OPERATIONAL_STAGES : SALES_STAGES;

  const jobsByStage = React.useMemo(() => {
    const acc = columns.reduce((map, stage) => {
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
  }, [jobs, columns]);

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-none p-4 md:p-6 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag-free dense tracking. {jobs?.length || 0} active jobs.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-muted p-1 rounded-md inline-flex items-center border border-border">
            <Button
              variant={view === "operational" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("operational")}
              className="h-7 text-xs px-3 shadow-none rounded"
            >
              Operations
            </Button>
            <Button
              variant={view === "sales" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("sales")}
              className="h-7 text-xs px-3 shadow-none rounded"
            >
              Sales Pipeline
            </Button>
          </div>
          
          {user?.role === "admin" && (
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-9">
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-accent/20">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full w-max p-4 md:p-6 gap-4">
            {columns.map(stage => (
              <BoardColumn 
                key={stage} 
                stage={stage} 
                jobs={jobsByStage[stage] || []} 
              />
            ))}
          </div>
        )}
      </div>

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function BoardColumn({ stage, jobs }: { stage: string, jobs: Job[] }) {
  return (
    <div className="flex flex-col w-[320px] shrink-0 h-full max-h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          {STAGE_LABELS[stage] || stage}
        </h3>
        <div className="bg-muted text-muted-foreground text-xs font-mono px-2 py-0.5 rounded-full border border-border">
          {jobs.length}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-4 pr-2">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <div className="h-24 rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground bg-card/50">
            No jobs in stage
          </div>
        )}
      </div>
    </div>
  );
}
