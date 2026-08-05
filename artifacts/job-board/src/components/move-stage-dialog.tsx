import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_LABELS, OPERATIONAL_STAGES } from "@/lib/utils";
import { toast } from "sonner";
import { queryClient } from "@/lib/query-client";
import { Job, JobStage, JobStageMove, useMoveJobStage, getListJobsQueryKey, getGetBoardSummaryQueryKey } from "@workspace/api-client-react";

export function MoveStageDialog({ job, targetStage, open, onOpenChange }: { job: Job, targetStage: JobStage, open: boolean, onOpenChange: (open: boolean) => void }) {
  const moveStage = useMoveJobStage();
  const [date, setDate] = React.useState(job.estimatedInstallDate || "");

  // Every stage from Sold onward requires an install date (same rule as the
  // server) — not just Sold itself, so the dialog collects the date up front
  // instead of surfacing a server error after the fact.
  const requiresDate =
    (OPERATIONAL_STAGES as readonly string[]).includes(targetStage) &&
    !job.estimatedInstallDate;

  // If the dialog opens and we don't actually require a date, 
  // we could just execute immediately, but having a confirmation step is nice 
  // to prevent accidental clicks.

  const handleConfirm = () => {
    if (requiresDate && !date) {
      toast.error("Estimated install date is required for this stage");
      return;
    }

    moveStage.mutate({
      id: job.id,
      data: {
        stage: targetStage,
        estimatedInstallDate: date || undefined,
      } as JobStageMove
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
        toast.success(`Moved to ${STAGE_LABELS[targetStage]}`);
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast.error(err?.data?.error || "Failed to move stage");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to {STAGE_LABELS[targetStage]}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            You are moving <span className="font-semibold text-foreground">{job.customerName}</span> to the {STAGE_LABELS[targetStage]} stage.
          </p>
        </DialogHeader>

        {requiresDate && (
          <div className="space-y-4 my-4 bg-accent/30 p-4 rounded-md border border-primary/20">
            <p className="text-sm font-medium text-primary">
              Moving a job to "{STAGE_LABELS[targetStage] ?? targetStage}" requires an
              estimated install date.
            </p>
            <div className="space-y-2">
              <Label htmlFor="installDateConfirm">Estimated Install Date <span className="text-destructive">*</span></Label>
              <Input 
                id="installDateConfirm" 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
              />
            </div>
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={moveStage.isPending}>
            {moveStage.isPending ? "Moving..." : "Confirm Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
