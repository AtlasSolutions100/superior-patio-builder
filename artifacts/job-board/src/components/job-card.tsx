import * as React from "react";
import { formatDate } from "@/lib/utils";
import { useStages } from "@/hooks/use-stages";
import { ChevronDown, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
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
import { toTelHref, formatPhoneInput } from "@/lib/phone";

export default function JobCard({
  job,
  variant = "job",
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  selected = false,
  onToggleSelect,
}: {
  job: Job;
  /** "lead" shows sales essentials (phone, source) instead of install date/contract. */
  variant?: "job" | "lead";
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Selection mode (bulk archive): clicking toggles instead of editing. */
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { data: user } = useGetCurrentUser();
  const stg = useStages();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [moveStageIntent, setMoveStageIntent] = React.useState<JobStage | null>(null);

  const canEdit = user?.role === "admin";
  // On the sales pipeline, moves are admin-only (techs work installs on the
  // main board); elsewhere techs keep their Move menu.
  const canTechEdit = user?.role === "tech" || canEdit;
  const showMoveMenu = variant === "lead" ? canEdit : canTechEdit;

  // On the pipeline, a lead that reached the job pipeline is converted — it
  // now lives on the Job Board.
  const isConverted = variant === "lead" && stg.isJobStage(job.stage);

  const isLate =
    job.estimatedInstallDate &&
    new Date(job.estimatedInstallDate) < new Date() &&
    !stg.isComplete(job.stage);

  // Move menu: both pipelines for admins; techs only move within the job
  // pipeline, into stages flagged for them (Settings › "Techs can move here").
  const moveGroups = [
    { label: "Sales Pipeline", stages: stg.salesStages },
    { label: "Job Board", stages: stg.jobStages },
  ]
    .map(group => ({
      label: group.label,
      stages: group.stages.filter(stage => {
        if (stage.key === job.stage) return false;
        if (user?.role === "tech" && (stage.pipeline !== "job" || !stage.techCanMove))
          return false;
        return true;
      }),
    }))
    .filter(group => group.stages.length > 0);

  return (
    <>
      <Card
        draggable={draggable && !onToggleSelect}
        onClick={onToggleSelect}
        onDragStart={e => {
          if (!draggable || onToggleSelect) return;
          // dataTransfer can be absent on synthetic events; drag state must
          // still be set so drop zones appear.
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(job.id));
          }
          onDragStart?.();
        }}
        onDragEnd={() => onDragEnd?.()}
        className={`flex flex-col rounded-lg shadow-none ${
          variant === "lead" ? "p-3 gap-2" : "p-4 gap-3"
        } ${
          isConverted ? "bg-muted/50 border-border/50" : "bg-card border-border/70"
        } ${draggable && !onToggleSelect ? "cursor-grab active:cursor-grabbing" : ""} ${
          isDragging ? "opacity-40" : ""
        } ${
          onToggleSelect
            ? `cursor-pointer ${selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"}`
            : ""
        }`}
      >
        {onToggleSelect && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium -mb-1.5">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                selected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/40"
              }`}
            >
              {selected && <CheckCircle2 className="h-3 w-3" />}
            </span>
            <span className={selected ? "text-primary" : "text-muted-foreground"}>
              {selected ? "Selected" : "Tap to select"}
            </span>
          </div>
        )}
        <div className="min-w-0">
          {isConverted ? (
            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stg.labelOf(job.stage)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/80 mb-1 truncate">
              {stg.labelOf(job.stage)}
            </div>
          )}
          <h4
            className="font-medium text-sm text-foreground truncate cursor-pointer hover:text-primary"
            onClick={() => !onToggleSelect && setIsEditOpen(true)}
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
              {job.phone && (() => {
                const telHref = toTelHref(job.phone);
                const display = formatPhoneInput(job.phone);
                return telHref ? (
                  <a
                    href={telHref}
                    className="text-muted-foreground hover:text-primary truncate"
                    onClick={e => e.stopPropagation()}
                  >
                    {display}
                  </a>
                ) : (
                  <span className="text-muted-foreground truncate">{display}</span>
                );
              })()}
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

        {isConverted && (
          <Link
            href="/board"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          >
            Now on the Job Board
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}

        {showMoveMenu && moveGroups.length > 0 && (
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
              {moveGroups.map((group, gi) => (
                <React.Fragment key={group.label}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.stages.map(stage => (
                    <DropdownMenuItem key={stage.key} onClick={() => setMoveStageIntent(stage.key)}>
                      {stage.label}
                    </DropdownMenuItem>
                  ))}
                </React.Fragment>
              ))}
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
