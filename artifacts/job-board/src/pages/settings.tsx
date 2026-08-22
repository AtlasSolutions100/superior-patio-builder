import * as React from "react";
import {
  useGetCurrentUser,
  useCreateStage,
  useUpdateStage,
  useRemoveStage,
  useReorderStages,
  getListStagesQueryKey,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  type Stage,
} from "@workspace/api-client-react";
import { useStages } from "@/hooks/use-stages";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Admin settings: the stage lists behind the Sales Pipeline and the Job
 * Board. Add, rename, reorder, or remove stages — every board, list, filter,
 * and rule in the app follows this page.
 */
export default function SettingsPage() {
  const { data: user } = useGetCurrentUser();
  const stg = useStages();

  if (user && user.role !== "admin") {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Settings are for admins — ask Justin or Blair if a stage needs changing.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="px-4 md:px-6 py-4 max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Pipeline Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
          These stages are the columns on the Sales Pipeline and the Job Board.
          Rename, reorder, add, or remove them — jobs are never lost: removing a
          stage moves its jobs to a stage you pick.
        </p>

        {stg.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading stages…
          </div>
        ) : (
          <div className="mt-6 space-y-8 pb-10">
            <PipelineSection
              title="Sales Pipeline (leads)"
              hint="Leads move through these before they're sold. The first stage is where new and imported leads land."
              pipeline="sales"
              stages={stg.salesStages}
            />
            <PipelineSection
              title="Job Board"
              hint="Sold work moves through these until it's done. Moving a job into any of these requires an Estimated Install Date."
              pipeline="job"
              stages={stg.jobStages}
              showFlags
            />
          </div>
        )}
      </div>
    </div>
  );
}

function invalidateAll() {
  queryClient.invalidateQueries({ queryKey: getListStagesQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
}

const errMsg = (err: any, fallback: string) => err?.data?.error || fallback;

function PipelineSection({
  title,
  hint,
  pipeline,
  stages,
  showFlags = false,
}: {
  title: string;
  hint: string;
  pipeline: "sales" | "job";
  stages: Stage[];
  showFlags?: boolean;
}) {
  const createStage = useCreateStage();
  const reorderStages = useReorderStages();
  const [newLabel, setNewLabel] = React.useState("");
  const [removeIntent, setRemoveIntent] = React.useState<Stage | null>(null);

  const busy = createStage.isPending || reorderStages.isPending;

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    createStage.mutate(
      { data: { label, pipeline } },
      {
        onSuccess: () => {
          setNewLabel("");
          invalidateAll();
          toast.success(`Added "${label}"`);
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't add the stage — try again.")),
      },
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    const keys = stages.map((s) => s.key);
    const target = index + dir;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    reorderStages.mutate(
      { data: { pipeline, keys } },
      {
        onSuccess: invalidateAll,
        onError: (err: any) => toast.error(errMsg(err, "Couldn't reorder — try again.")),
      },
    );
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3 max-w-xl">{hint}</p>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {stages.map((stage, i) => (
          <StageRow
            key={stage.key}
            stage={stage}
            index={i}
            count={stages.length}
            showFlags={showFlags}
            onMove={move}
            onRemove={() => setRemoveIntent(stage)}
            reordering={reorderStages.isPending}
          />
        ))}
        {stages.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No stages yet — add the first one below.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={pipeline === "sales" ? "e.g. Follow-up Call" : "e.g. Waiting for Delivery"}
          className="h-8 text-sm max-w-xs"
        />
        <Button size="sm" className="h-8" onClick={handleAdd} disabled={busy || !newLabel.trim()}>
          {createStage.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5 mr-1.5" />
          )}
          Add stage
        </Button>
      </div>

      {removeIntent && (
        <RemoveStageDialog
          stage={removeIntent}
          siblings={stages.filter((s) => s.id !== removeIntent.id)}
          onOpenChange={(open) => !open && setRemoveIntent(null)}
        />
      )}
    </section>
  );
}

function StageRow({
  stage,
  index,
  count,
  showFlags,
  onMove,
  onRemove,
  reordering,
}: {
  stage: Stage;
  index: number;
  count: number;
  showFlags: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: () => void;
  reordering: boolean;
}) {
  const updateStage = useUpdateStage();
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(stage.label);

  React.useEffect(() => setLabel(stage.label), [stage.label]);

  const saveLabel = () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === stage.label) {
      setEditing(false);
      setLabel(stage.label);
      return;
    }
    updateStage.mutate(
      { id: stage.id, data: { label: trimmed } },
      {
        onSuccess: () => {
          setEditing(false);
          invalidateAll();
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't rename the stage — try again.")),
      },
    );
  };

  const setFlag = (data: { techCanMove?: boolean; isComplete?: boolean }) => {
    updateStage.mutate(
      { id: stage.id, data },
      {
        onSuccess: invalidateAll,
        onError: (err: any) => toast.error(errMsg(err, "Couldn't update the stage — try again.")),
      },
    );
  };

  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <div className="flex flex-col -my-1">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0 || reordering}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
          title="Move up"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1 || reordering}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
          title="Move down"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel();
                if (e.key === "Escape") {
                  setEditing(false);
                  setLabel(stage.label);
                }
              }}
              className="h-7 text-sm max-w-xs"
            />
            <button
              type="button"
              onClick={saveLabel}
              disabled={updateStage.isPending}
              className="p-1 text-primary hover:text-primary/80 disabled:opacity-50"
              title="Save name"
            >
              {updateStage.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setLabel(stage.label);
              }}
              className="p-1 text-muted-foreground hover:text-foreground"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group inline-flex items-center gap-1.5 max-w-full"
            title="Rename stage"
          >
            <span className="text-sm font-medium truncate">{stage.label}</span>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        )}
        <div className="text-[11px] text-muted-foreground">
          {stage.jobCount === 0
            ? "Empty"
            : `${stage.jobCount} ${stage.pipeline === "sales" ? "lead" : "job"}${stage.jobCount === 1 ? "" : "s"}`}
        </div>
      </div>

      {showFlags && (
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer" title="Install techs may move jobs into this stage">
            <Switch
              checked={stage.techCanMove}
              onCheckedChange={(v) => setFlag({ techCanMove: v })}
              className="scale-75"
            />
            Techs can move here
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" title="Jobs here count as finished — no 'late install' warnings">
            <Switch
              checked={stage.isComplete}
              onCheckedChange={(v) => setFlag({ isComplete: v })}
              className="scale-75"
            />
            Counts as done
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
        title="Remove stage"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function RemoveStageDialog({
  stage,
  siblings,
  onOpenChange,
}: {
  stage: Stage;
  siblings: Stage[];
  onOpenChange: (open: boolean) => void;
}) {
  const removeStage = useRemoveStage();
  const [moveTo, setMoveTo] = React.useState(siblings[0]?.key ?? "");
  const hasJobs = stage.jobCount > 0;

  const handleRemove = () => {
    removeStage.mutate(
      { id: stage.id, data: hasJobs ? { moveTo } : {} },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(
            hasJobs
              ? `Removed "${stage.label}" — its ${stage.jobCount === 1 ? "job" : "jobs"} moved to ${
                  siblings.find((s) => s.key === moveTo)?.label ?? moveTo
                }`
              : `Removed "${stage.label}"`,
          );
          onOpenChange(false);
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't remove the stage — try again.")),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove "{stage.label}"?</DialogTitle>
          <DialogDescription>
            {hasJobs
              ? `${stage.jobCount} ${stage.jobCount === 1 ? "record is" : "records are"} in this stage. Pick where they should go — nothing is deleted.`
              : "This stage is empty. If you add a stage with the same name later, its history comes back with it."}
          </DialogDescription>
        </DialogHeader>

        {hasJobs && (
          <div className="space-y-2">
            <Label htmlFor="moveTo">Move them to</Label>
            <select
              id="moveTo"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {siblings.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removeStage.isPending || (hasJobs && !moveTo)}
          >
            {removeStage.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Remove stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
