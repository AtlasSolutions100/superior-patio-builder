import * as React from "react";
import { formatDate, STAGE_LABELS } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
      <Card className="flex flex-col bg-card p-3 gap-2 shadow-none">
        <div className="min-w-0">
          <h4
            className={`font-semibold text-sm text-foreground truncate ${canTechEdit ? "cursor-pointer hover:text-primary" : ""}`}
            onClick={() => canTechEdit && setIsEditOpen(true)}
          >
            {job.customerName}
          </h4>
          <div className="text-xs text-muted-foreground truncate">
            {job.city || "No city"} · {job.coverType || "TBD"}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className={isLate ? "text-destructive font-semibold" : "text-muted-foreground"}>
            {job.estimatedInstallDate ? formatDate(job.estimatedInstallDate) : "No install date"}
          </span>
          {job.contractAmount != null && (
            <span className="font-medium text-foreground">
              ${job.contractAmount.toLocaleString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-y-1.5">
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
          <p className="text-xs text-muted-foreground italic line-clamp-1" title={job.lastNote}>
            "{job.lastNote}"
          </p>
        )}

        {canTechEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-full text-xs justify-between font-normal text-muted-foreground">
                Move stage
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              {Object.entries(STAGE_LABELS).map(([stageValue, label]) => {
                if (stageValue === job.stage) return null;
                if (user?.role === "tech" && stageValue !== "installed") return null;
                return (
                  <DropdownMenuItem key={stageValue} onClick={() => setMoveStageIntent(stageValue as JobStage)}>
                    {label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
