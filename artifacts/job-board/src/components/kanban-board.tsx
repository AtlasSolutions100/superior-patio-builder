import * as React from "react";
import { Job, JobStage, useGetCurrentUser } from "@workspace/api-client-react";
import { sortByInstallDate } from "@/lib/utils";
import { useStages } from "@/hooks/use-stages";
import { Loader2 } from "lucide-react";
import JobCard from "@/components/job-card";
import { MoveStageDialog } from "@/components/move-stage-dialog";

const COL_MIN_WIDTH = 240; // px
// Cap column width so boards with few columns (e.g. the 4-column Sales
// Pipeline) don't stretch to fill wide screens and inflate every card.
const COL_MAX_WIDTH = 320; // px
const EDGE_SCROLL_ZONE = 90; // px from container edge that triggers auto-scroll
const EDGE_SCROLL_SPEED = 16; // px per frame at full intensity

export interface BoardGroup {
  key: string;
  label: string;
  stages: string[];
}

/**
 * Shared Kanban board: columns, drag-and-drop with edge auto-scroll, and the
 * move-stage confirmation dialog. Used by both the main Job Board and the
 * Sales Pipeline view so behavior and visuals stay identical.
 */
export function KanbanBoard({
  jobs,
  groups,
  isLoading,
  cardVariant = "job",
  selectedIds,
  onToggleSelect,
  hasFilters,
  onClearFilters,
  emptyLabel,
}: {
  jobs: Job[];
  groups: BoardGroup[];
  isLoading?: boolean;
  /** "lead" renders sales-essentials cards and restricts moves to admins. */
  cardVariant?: "job" | "lead";
  /** When onToggleSelect is set, cards enter selection mode (bulk archive). */
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  /** Filters are active upstream — empty columns say "no matches" instead of "empty". */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** What an empty (unfiltered) column holds, e.g. "No leads yet". */
  emptyLabel?: string;
}) {
  const { data: user } = useGetCurrentUser();
  const stg = useStages();

  // Drag-and-drop state. Dropping never moves a job directly — it opens the
  // same MoveStageDialog used by the "Move" dropdown so all rules
  // (e.g. Sold requires an install date) keep applying.
  const [draggingJob, setDraggingJob] = React.useState<Job | null>(null);
  const [dropIntent, setDropIntent] = React.useState<{ job: Job; stage: JobStage } | null>(null);

  // On the sales pipeline, moving leads is admin-only; techs keep dragging
  // (into Installed) on the main board.
  const canDrag =
    !onToggleSelect &&
    (user?.role === "admin" || (cardVariant === "job" && user?.role === "tech"));

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pointerX = React.useRef(0);

  // Auto-scroll the board horizontally while dragging near its edges.
  React.useEffect(() => {
    if (!draggingJob) return;
    let raf = 0;
    const step = () => {
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = pointerX.current;
        if (x > 0) {
          if (x < rect.left + EDGE_SCROLL_ZONE) {
            const intensity = Math.min(1, (rect.left + EDGE_SCROLL_ZONE - x) / EDGE_SCROLL_ZONE);
            el.scrollLeft -= EDGE_SCROLL_SPEED * intensity;
          } else if (x > rect.right - EDGE_SCROLL_ZONE) {
            const intensity = Math.min(1, (x - (rect.right - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE);
            el.scrollLeft += EDGE_SCROLL_SPEED * intensity;
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [draggingJob]);

  const jobsByStage = React.useMemo(() => {
    const acc: Record<string, Job[]> = {};
    jobs.forEach(job => {
      (acc[job.stage] ||= []).push(job);
    });
    return acc;
  }, [jobs]);

  // Stages a dragged job may be dropped into, per role. Same rules as the
  // "Move" dropdown: admins anywhere (except the current stage), techs only
  // into job-pipeline stages flagged "Techs can move here", viewers not at all.
  const droppableStages = (stages: string[]): JobStage[] => {
    if (!draggingJob) return [];
    return stages.filter(stage => {
      if (stage === draggingJob.stage) return false;
      if (user?.role === "tech") {
        const meta = stg.byKey.get(stage);
        if (meta?.pipeline !== "job" || !meta.techCanMove) return false;
        return true;
      }
      if (user?.role !== "admin") return false;
      return true;
    });
  };

  const handleDrop = (stage: JobStage) => {
    if (draggingJob) setDropIntent({ job: draggingJob, stage });
    setDraggingJob(null);
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden board-scrollbar snap-x snap-proximity md:snap-none"
        onDragOver={e => {
          pointerX.current = e.clientX;
        }}
      >
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className="grid h-full gap-4 md:gap-5 px-4 md:px-6 pb-6 min-w-full w-max"
            style={{
              // On phones a column is ~85% of the viewport (swipe one at a
              // time); on desktop the clamp caps it at the usual width.
              gridTemplateColumns: `repeat(${groups.length}, clamp(${COL_MIN_WIDTH}px, 85vw, ${COL_MAX_WIDTH}px))`,
              // Bound the single row to the board height — otherwise the row
              // auto-sizes to the tallest column, the overflow gets clipped by
              // the board's overflow-y-hidden, and column lists never scroll.
              gridTemplateRows: "minmax(0, 1fr)",
            }}
          >
            {groups.map(group => (
              <GroupColumn
                key={group.key}
                label={group.label}
                jobs={sortByInstallDate(group.stages.flatMap(stage => jobsByStage[stage] || []))}
                draggingJob={draggingJob}
                dropStages={droppableStages(group.stages)}
                onDropStage={handleDrop}
                canDrag={canDrag}
                cardVariant={cardVariant}
                onDragStart={setDraggingJob}
                onDragEnd={() => setDraggingJob(null)}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                hasFilters={hasFilters}
                onClearFilters={onClearFilters}
                emptyLabel={emptyLabel}
              />
            ))}
          </div>
        )}
      </div>

      {dropIntent && (
        <MoveStageDialog
          job={dropIntent.job}
          targetStage={dropIntent.stage}
          open={!!dropIntent}
          onOpenChange={v => !v && setDropIntent(null)}
        />
      )}
    </>
  );
}

function GroupColumn({
  label,
  jobs,
  draggingJob,
  dropStages,
  onDropStage,
  canDrag,
  cardVariant,
  onDragStart,
  onDragEnd,
  selectedIds,
  onToggleSelect,
  hasFilters,
  onClearFilters,
  emptyLabel,
}: {
  label: string;
  jobs: Job[];
  draggingJob: Job | null;
  dropStages: JobStage[];
  onDropStage: (stage: JobStage) => void;
  canDrag: boolean;
  cardVariant: "job" | "lead";
  onDragStart: (job: Job) => void;
  onDragEnd: () => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  emptyLabel?: string;
}) {
  const isDropTarget = !!draggingJob && dropStages.length > 0;

  return (
    <div className="flex flex-col h-full max-h-full min-w-0 min-h-0 snap-start scroll-ml-4">
      <div className="flex items-baseline gap-2 mb-3 shrink-0">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{jobs.length}</span>
      </div>

      {isDropTarget && (
        <div className="shrink-0 space-y-1.5 mb-3">
          {dropStages.map(stage => (
            <StageDropZone key={stage} stage={stage} onDropStage={onDropStage} />
          ))}
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-4 pr-0.5 ${
          draggingJob && !isDropTarget ? "opacity-50" : ""
        }`}
      >
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            variant={cardVariant}
            draggable={canDrag}
            isDragging={draggingJob?.id === job.id}
            onDragStart={() => onDragStart(job)}
            onDragEnd={onDragEnd}
            selected={selectedIds?.has(job.id) ?? false}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(job.id) : undefined}
          />
        ))}
        {jobs.length === 0 && (
          <div className="h-24 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground/70">
            {hasFilters ? (
              <>
                <span>No matches here</span>
                {onClearFilters && (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="text-primary hover:underline font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </>
            ) : (
              <span>{emptyLabel ?? "No jobs yet"}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StageDropZone({
  stage,
  onDropStage,
}: {
  stage: JobStage;
  onDropStage: (stage: JobStage) => void;
}) {
  const stg = useStages();
  const [isOver, setIsOver] = React.useState(false);

  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsOver(false);
        onDropStage(stage);
      }}
      className={`h-11 rounded-lg border-2 border-dashed flex items-center justify-center px-2 text-xs font-medium transition-colors ${
        isOver
          ? "border-primary bg-primary/10 text-primary"
          : "border-primary/40 bg-primary/5 text-muted-foreground"
      }`}
    >
      <span className="truncate">{stg.labelOf(stage)}</span>
    </div>
  );
}
