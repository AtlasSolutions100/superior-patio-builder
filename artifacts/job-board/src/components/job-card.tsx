import * as React from "react";
import { formatDate, STAGE_LABELS, STAGE_GROUPS, PIPELINE_STAGES } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Job, JobStage, useGetCurrentUser } from "@workspace/api-client-react";
import { JobDialog } from "./job-dialog";
import { MoveStageDialog } from "./move-stage-dialog";

const MOVE_GROUPS: { label: string; stages: string[] }[] = [
  { label: "Pipeline", stages: [...PIPELINE_STAGES] },
  ...STAGE_GROUPS.map(g => ({ label: g.label, stages: g.stages })),
];

export default function JobCard({
  job,
  variant = "job",
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: {
  job: Job;
  /** "lead" shows sales essentials (phone, source) instead of install date/contract. */
  variant?: "job" | "lead";
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { data: user } = useGetCurrentUser();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [moveStageIntent, setMoveStageIntent] = React.useState<JobStage | null>(null);

  const canEdit = user?.role === "admin";
  // On the sales pipeline, moves are admin-only (techs work installs on the
  // main board); elsewhere techs keep their Move menu.
  const canTechEdit = user?.role === "tech" || canEdit;
  const showMoveMenu = variant === "lead" ? canEdit : canTechEdit;

  const isLate =
    job.estimatedInstallDate &&
    new Date(job.estimatedInstallDate) < new Date() &&
    job.stage !== "installed" &&
    job.stage !== "post_install_follow_up" &&
    job.stage !== "review_asked";

  return (
    <>
      <Card
        draggable={draggable}
        onDragStart={e => {
          if (!draggable) return;
          // dataTransfer can be absent on synthetic events; drag state must
          // still be set so drop zones appear.
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(job.id));
          }
          onDragStart?.();
        }}
        onDragEnd={() => onDragEnd?.()}
        className={`flex flex-col bg-card rounded-xl border-border/70 p-4 gap-3 shadow-none ${
          draggable ? "cursor-grab active:cursor-grabbing" : ""
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground/80 mb-1 truncate">
            {STAGE_LABELS[job.stage] || job.stage}
          </div>
          <h4
            className="font-medium text-sm text-foreground truncate cursor-pointer hover:text-primary"
            onClick={() => setIsEditOpen(true)}
          >
            {job.customerName}
          </h4>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {job.city || "No city"} · {job.coverType || "TBD"}
          </div>
        </div>

        {variant === "lead" ? (
          (job.phone || job.source) && (
            <div className="flex items-center justify-between gap-2 text-xs">
              {job.phone && (
                <a
                  href={`tel:${job.phone}`}
                  className="text-muted-foreground hover:text-primary truncate"
                  onClick={e => e.stopPropagation()}
                >
                  {job.phone}
                </a>
              )}
              {job.source && (
                <span className="ml-auto max-w-[45%] truncate rounded-full bg-accent/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {job.source}
                </span>
              )}
            </div>
          )
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span className={isLate ? "text-destructive font-medium" : "text-muted-foreground"}>
              {job.estimatedInstallDate
                ? `Install: ${formatDate(job.estimatedInstallDate)}`
                : "No install date"}
            </span>
            {job.contractAmount != null && (
              <span className="font-medium text-foreground tabular-nums">
                ${job.contractAmount.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {job.lastNote && (
          <p className="text-xs text-muted-foreground line-clamp-1" title={job.lastNote}>
            {job.lastNote}
          </p>
        )}

        {showMoveMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs justify-between font-normal text-muted-foreground hover:text-foreground -mx-1 px-2"
              >
                Move
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-y-auto">
              {MOVE_GROUPS.map((group, gi) => {
                const items = group.stages.filter(stage => {
                  if (stage === job.stage) return false;
                  if (user?.role === "tech" && stage !== "installed") return false;
                  return true;
                });
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={group.label}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                      {group.label}
                    </DropdownMenuLabel>
                    {items.map(stage => (
                      <DropdownMenuItem key={stage} onClick={() => setMoveStageIntent(stage as JobStage)}>
                        {STAGE_LABELS[stage] || stage}
                      </DropdownMenuItem>
                    ))}
                  </React.Fragment>
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
