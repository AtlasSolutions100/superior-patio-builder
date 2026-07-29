import * as React from "react";
import { formatCurrency, formatDate, STAGE_LABELS } from "@/lib/utils";
import { MapPin, Calendar, DollarSign, MoreHorizontal, PenSquare, ArrowRightCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Job, JobStage, useUpdateJob, getListJobsQueryKey, getGetBoardSummaryQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { JobDialog } from "./job-dialog";
import { MoveStageDialog } from "./move-stage-dialog";

export default function JobCard({ job }: { job: Job }) {
  const { data: user } = useGetCurrentUser();
  const updateJob = useUpdateJob();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [moveStageIntent, setMoveStageIntent] = React.useState<JobStage | null>(null);

  const canEdit = user?.role === "admin";
  const canTechEdit = user?.role === "tech" || canEdit;

  const handleToggle = (field: keyof Pick<Job, "invoicedWithQb" | "depositPaid" | "materialOrdered" | "materialReceived">) => {
    if (!canEdit) return;
    
    // Optimistic local update via API would be best, but we'll just fire mutation and invalidate
    updateJob.mutate({
      id: job.id,
      data: { [field]: !job[field] }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
      }
    });
  };

  const isLate = job.estimatedInstallDate && new Date(job.estimatedInstallDate) < new Date() && job.stage !== 'installed' && job.stage !== 'post_install_follow_up' && job.stage !== 'review_asked';

  return (
    <>
      <Card className="flex flex-col bg-card overflow-hidden hover:border-primary/30 transition-colors group">
        <div className="p-3 border-b border-border bg-muted/30 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate cursor-pointer hover:text-primary" onClick={() => canTechEdit && setIsEditOpen(true)}>
              {job.customerName}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{job.city || "No city"}</span>
              <span className="opacity-50 mx-0.5">•</span>
              <span className="truncate text-foreground/80 font-medium">{job.coverType || "TBD"}</span>
            </div>
          </div>
          
          <div className="shrink-0 flex items-center">
            {canTechEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                    <PenSquare className="mr-2 h-4 w-4" />
                    Edit Job
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Move Stage</DropdownMenuLabel>
                  {Object.entries(STAGE_LABELS).map(([stageValue, label]) => {
                    if (stageValue === job.stage) return null;
                    if (user?.role === "tech" && stageValue !== "installed") return null;
                    return (
                      <DropdownMenuItem key={stageValue} onClick={() => setMoveStageIntent(stageValue as JobStage)}>
                        <ArrowRightCircle className="mr-2 h-4 w-4 text-primary" />
                        {label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className={`flex items-center gap-1.5 font-mono ${isLate ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
              <Calendar className="w-3.5 h-3.5" />
              {job.estimatedInstallDate ? formatDate(job.estimatedInstallDate) : "TBD"}
            </div>
            {job.contractAmount != null && (
              <div className="flex items-center gap-1 text-foreground font-mono font-medium bg-accent/50 px-1.5 py-0.5 rounded">
                <DollarSign className="w-3 h-3 text-muted-foreground" />
                {job.contractAmount.toLocaleString()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-y-2 mt-2 pt-2 border-t border-border/50">
            <ToggleItem 
              id={`qb-${job.id}`} 
              label="Invoiced" 
              checked={job.invoicedWithQb} 
              onToggle={() => handleToggle("invoicedWithQb")} 
              disabled={!canEdit} 
            />
            <ToggleItem 
              id={`dep-${job.id}`} 
              label="Deposit" 
              checked={job.depositPaid} 
              onToggle={() => handleToggle("depositPaid")} 
              disabled={!canEdit} 
            />
            <ToggleItem 
              id={`mo-${job.id}`} 
              label="Mat. Ord" 
              checked={job.materialOrdered} 
              onToggle={() => handleToggle("materialOrdered")} 
              disabled={!canEdit} 
            />
            <ToggleItem 
              id={`mr-${job.id}`} 
              label="Mat. Rec" 
              checked={job.materialReceived} 
              onToggle={() => handleToggle("materialReceived")} 
              disabled={!canEdit} 
            />
          </div>

          {job.lastNote && (
            <div className="mt-2 text-xs bg-muted/40 p-2 rounded-md border border-border/50 italic text-muted-foreground line-clamp-2">
              "{job.lastNote}"
            </div>
          )}
        </div>
      </Card>

      {isEditOpen && <JobDialog job={job} open={isEditOpen} onOpenChange={setIsEditOpen} />}
      {moveStageIntent && (
        <MoveStageDialog 
          job={job} 
          targetStage={moveStageIntent} 
          open={!!moveStageIntent} 
          onOpenChange={(v) => !v && setMoveStageIntent(null)} 
        />
      )}
    </>
  );
}

function ToggleItem({ id, label, checked, onToggle, disabled }: { id: string, label: string, checked: boolean, onToggle: () => void, disabled: boolean }) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox 
        id={id} 
        checked={checked} 
        onCheckedChange={onToggle}
        disabled={disabled}
        className="w-3.5 h-3.5"
      />
      <Label 
        htmlFor={id} 
        className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground cursor-pointer"
      >
        {label}
      </Label>
    </div>
  );
}
