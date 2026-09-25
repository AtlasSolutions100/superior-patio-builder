import * as React from "react";
import {
  useGetCurrentUser,
  useCreateStage,
  useUpdateStage,
  useRemoveStage,
  useReorderStages,
  useListLeadSources,
  useCreateLeadSource,
  useTestLeadSource,
  useUpdateLeadSource,
  useDeleteLeadSource,
  useSyncLeadSource,
  useListCommissionTiers,
  useCreateCommissionTier,
  useUpdateCommissionTier,
  useDeleteCommissionTier,
  getListStagesQueryKey,
  getListLeadSourcesQueryKey,
  getListCommissionTiersQueryKey,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  type Stage,
  type LeadSource,
  type LeadSourceTestResult,
  type CommissionTier,
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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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
            <LeadSheetsSection />
            <CommissionSection />
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


// ---------------------------------------------------------------------------
// Lead sheets — the Google Sheets the importer pulls new leads from.
// ---------------------------------------------------------------------------

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function LeadSheetsSection() {
  const { data: sources, isLoading } = useListLeadSources({
    query: { queryKey: getListLeadSourcesQueryKey() },
  });
  const createSource = useCreateLeadSource();
  const testSource = useTestLeadSource();

  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [testResult, setTestResult] = React.useState<LeadSourceTestResult | null>(null);

  const invalidateSources = () => {
    queryClient.invalidateQueries({ queryKey: getListLeadSourcesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
  };

  const handleTest = () => {
    if (!url.trim()) return;
    setTestResult(null);
    testSource.mutate(
      { data: { csvUrl: url.trim() } },
      {
        onSuccess: setTestResult,
        onError: () => toast.error("Couldn't test that link — try again."),
      },
    );
  };

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Give the sheet a name and paste its link");
      return;
    }
    createSource.mutate(
      { data: { name: name.trim(), csvUrl: url.trim() } },
      {
        onSuccess: (created) => {
          setName("");
          setUrl("");
          setTestResult(null);
          invalidateSources();
          toast.success(`Added "${created.name}" — it syncs every 15 minutes`);
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't add the sheet — try again.")),
      },
    );
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Lead sheets</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3 max-w-xl">
        Google Sheets that new leads are imported from, checked every 15
        minutes. The sheet must be shared as "Anyone with the link → Viewer"
        and have Date, First Name, Last Name, and Phone columns. A lead is
        never imported twice, even if it appears in two sheets.
      </p>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading…
          </div>
        ) : (sources ?? []).length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No lead sheets yet — paste your sheet's link below and new leads
            will start flowing into the Sales Pipeline.
          </div>
        ) : (
          (sources ?? []).map((src) => (
            <LeadSheetRow key={src.id} source={src} onChanged={invalidateSources} />
          ))
        )}
      </div>

      <div className="mt-3 space-y-2 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Manufacturer leads"
            className="h-8 text-sm w-44"
          />
          <Input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
            placeholder="Paste the Google Sheet link"
            className="h-8 text-sm flex-1 min-w-[16rem]"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleTest}
            disabled={testSource.isPending || !url.trim()}
          >
            {testSource.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={createSource.isPending || !name.trim() || !url.trim()}
          >
            {createSource.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Add sheet
          </Button>
        </div>

        {testResult && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              testResult.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}
          >
            {testResult.ok ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Looks good — {testResult.rowCount} row{testResult.rowCount === 1 ? "" : "s"} found, all
                required columns present.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {testResult.error}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LeadSheetRow({
  source,
  onChanged,
}: {
  source: LeadSource;
  onChanged: () => void;
}) {
  const updateSource = useUpdateLeadSource();
  const deleteSource = useDeleteLeadSource();
  const syncOne = useSyncLeadSource();

  const handleToggle = (enabled: boolean) => {
    updateSource.mutate(
      { id: source.id, data: { enabled } },
      {
        onSuccess: onChanged,
        onError: (err: any) => toast.error(errMsg(err, "Couldn't update the sheet — try again.")),
      },
    );
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `Remove "${source.name}"? Leads already imported from it stay in the app; no new leads will come from this sheet.`,
      )
    )
      return;
    deleteSource.mutate(
      { id: source.id },
      {
        onSuccess: () => {
          onChanged();
          toast.success(`Removed "${source.name}"`);
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't remove the sheet — try again.")),
      },
    );
  };

  const handleSync = () => {
    syncOne.mutate(
      { id: source.id },
      {
        onSuccess: (fresh) => {
          onChanged();
          if (fresh.lastError) {
            toast.error(`${fresh.name}: ${fresh.lastError}`);
          } else {
            toast.success(
              fresh.lastImportedCount > 0
                ? `Imported ${fresh.lastImportedCount} new lead${fresh.lastImportedCount === 1 ? "" : "s"} from ${fresh.name}`
                : `${fresh.name} is up to date — no new leads`,
            );
          }
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't sync that sheet — try again.")),
      },
    );
  };

  return (
    <div className="px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{source.name}</span>
          {!source.enabled && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded-full px-1.5">
              Paused
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate" title={source.csvUrl}>
          {source.csvUrl}
        </div>
        <div className="text-[11px] mt-0.5">
          {source.lastError ? (
            <span className="text-destructive inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {source.lastError}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Last synced {fmtWhen(source.lastSyncedAt)}
              {source.lastSyncedAt
                ? ` · ${source.lastImportedCount} new last time`
                : ""}
            </span>
          )}
        </div>
      </div>

      <label
        className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer shrink-0"
        title="Paused sheets are skipped by the importer"
      >
        <Switch
          checked={source.enabled}
          onCheckedChange={handleToggle}
          className="scale-75"
        />
        Sync
      </label>

      <button
        type="button"
        onClick={handleSync}
        disabled={syncOne.isPending || !source.enabled}
        className="p-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 shrink-0"
        title="Import from this sheet now"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncOne.isPending ? "animate-spin" : ""}`} />
      </button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteSource.isPending}
        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
        title="Remove this sheet"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Commission — the rate paid on a sale, banded by contract size.
// ---------------------------------------------------------------------------

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function CommissionSection() {
  const { data: tiers, isLoading } = useListCommissionTiers({
    query: { queryKey: getListCommissionTiersQueryKey() },
  });
  const createTier = useCreateCommissionTier();
  const [cap, setCap] = React.useState("");
  const [rate, setRate] = React.useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCommissionTiersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
  };

  const list = tiers ?? [];
  const hasOpenBand = list.some((t) => t.upToAmount == null);
  const highestCap = list.reduce(
    (max, t) => (t.upToAmount != null && t.upToAmount > max ? t.upToAmount : max),
    0,
  );

  const handleAdd = () => {
    const r = Number(rate);
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      toast.error("Enter a rate between 0 and 100");
      return;
    }
    const c = cap.trim() === "" ? null : Number(cap);
    if (c !== null && (!Number.isFinite(c) || c <= 0)) {
      toast.error("Enter a dollar cap, or leave it blank for everything above");
      return;
    }
    createTier.mutate(
      { data: { upToAmount: c, ratePercent: r } },
      {
        onSuccess: () => {
          setCap("");
          setRate("");
          invalidate();
          toast.success("Commission band added");
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't add that band — try again.")),
      },
    );
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Commission</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3 max-w-xl">
        What a sale pays, by contract size. Each job shows its commission on
        the Job List and in the CSV export, credited to whoever is set as
        "Sold by" on the job.
      </p>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No commission bands yet — add your first one below.
          </div>
        ) : (
          list.map((tier) => (
            <CommissionRow key={tier.id} tier={tier} onChanged={invalidate} />
          ))
        )}
      </div>

      {!isLoading && list.length > 0 && !hasOpenBand && (
        <p className="text-xs text-muted-foreground mt-2 inline-flex items-start gap-1.5 max-w-xl">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
          <span>
            Jobs over {money(highestCap)} show no commission yet. Add a band and
            leave the cap blank to cover everything above.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-xs text-muted-foreground">Contracts up to</span>
        <Input
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="20000"
          inputMode="decimal"
          className="h-8 text-sm w-28"
        />
        <span className="text-xs text-muted-foreground">pay</span>
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="3"
          inputMode="decimal"
          className="h-8 text-sm w-20"
        />
        <span className="text-xs text-muted-foreground">%</span>
        <Button size="sm" className="h-8" onClick={handleAdd} disabled={createTier.isPending || !rate.trim()}>
          {createTier.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5 mr-1.5" />
          )}
          Add band
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Leave the dollar box empty for "everything above the last band".
      </p>
    </section>
  );
}

function CommissionRow({ tier, onChanged }: { tier: CommissionTier; onChanged: () => void }) {
  const updateTier = useUpdateCommissionTier();
  const deleteTier = useDeleteCommissionTier();
  const [rate, setRate] = React.useState(String(tier.ratePercent));

  React.useEffect(() => setRate(String(tier.ratePercent)), [tier.ratePercent]);

  const saveRate = () => {
    const r = Number(rate);
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      setRate(String(tier.ratePercent));
      toast.error("Enter a rate between 0 and 100");
      return;
    }
    if (r === tier.ratePercent) return;
    updateTier.mutate(
      { id: tier.id, data: { ratePercent: r } },
      {
        onSuccess: onChanged,
        onError: (err: any) => {
          setRate(String(tier.ratePercent));
          toast.error(errMsg(err, "Couldn't save that rate — try again."));
        },
      },
    );
  };

  const handleDelete = () => {
    deleteTier.mutate(
      { id: tier.id },
      {
        onSuccess: () => {
          onChanged();
          toast.success("Band removed");
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't remove that band — try again.")),
      },
    );
  };

  return (
    <div className="px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-sm">
        {tier.upToAmount == null ? (
          <span>Everything above the other bands</span>
        ) : (
          <span>Contracts up to <span className="font-medium">{money(tier.upToAmount)}</span></span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={saveRate}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          inputMode="decimal"
          className="h-7 w-16 text-sm text-right"
          aria-label="Commission rate percent"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteTier.isPending}
        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
        title="Remove this band"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
