import * as React from "react";
import {
  useListJobs,
  useGetCurrentUser,
  useGetLeadSyncStatus,
  useRunLeadSync,
  useBulkArchiveJobs,
  Job,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SALES_STAGES, PIPELINE_STAGES, STAGE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, AlertTriangle, RefreshCw, Archive, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { JobDialog } from "@/components/job-dialog";
import { KanbanBoard, BoardGroup } from "@/components/kanban-board";

// Four single-stage columns: New Lead → Scheduled → Bid Given → Sold.
// Sold also appears on the main Job Board — same jobs, both views.
const SALES_GROUPS: BoardGroup[] = SALES_STAGES.map(stage => ({
  key: stage,
  label: STAGE_LABELS[stage] || stage,
  stages: [stage],
}));

function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SalesPage() {
  const { data: user } = useGetCurrentUser();
  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs();
  const isAdmin = user?.role === "admin";

  const queryClient = useQueryClient();
  const { data: syncStatus } = useGetLeadSyncStatus({
    query: {
      queryKey: ["lead-sync-status"],
      enabled: isAdmin,
      refetchInterval: 60_000,
    },
  });
  const runSync = useRunLeadSync({
    mutation: {
      onSuccess: () => {
        // New leads may have been created — refresh both.
        void queryClient.invalidateQueries();
      },
      onError: (err: any) => {
        toast.error(err?.data?.error || "Couldn't start the sheet sync — try again.");
      },
    },
  });

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  // Bulk cleanup: "older than N days" dialog + card multi-select mode.
  const [isCleanupOpen, setIsCleanupOpen] = React.useState(false);
  const [olderThanDays, setOlderThanDays] = React.useState(60);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  const bulkArchive = useBulkArchiveJobs();
  const preview = useBulkArchiveJobs();

  // Refresh the preview count whenever the dialog is open for a given cutoff.
  // The request id guards against out-of-order responses when toggling
  // 30/60/90 quickly — only the latest request may set the count.
  const previewReqId = React.useRef(0);
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const [previewAttempt, setPreviewAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!isCleanupOpen) return;
    const reqId = ++previewReqId.current;
    setPreviewCount(null);
    setPreviewFailed(false);
    preview.mutate(
      { data: { olderThanDays, dryRun: true } },
      {
        onSuccess: r => {
          if (previewReqId.current === reqId) setPreviewCount(r.count);
        },
        onError: () => {
          // Without this, the dialog would show "Counting…" forever.
          if (previewReqId.current === reqId) setPreviewFailed(true);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCleanupOpen, olderThanDays, previewAttempt]);

  const finishBulk = () => {
    setIsCleanupOpen(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    void queryClient.invalidateQueries();
  };

  const bulkArchiveError = (err: any) =>
    toast.error(err?.data?.error || "Couldn't archive those leads — try again.");

  const archiveByAge = () => {
    bulkArchive.mutate(
      { data: { olderThanDays } },
      { onSuccess: finishBulk, onError: bulkArchiveError },
    );
  };

  const archiveSelected = () => {
    bulkArchive.mutate(
      { data: { jobIds: Array.from(selectedIds) } },
      { onSuccess: finishBulk, onError: bulkArchiveError },
    );
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Pipeline filters — all applied client-side on the loaded leads.
  const [fltStage, setFltStage] = React.useState("");
  const [fltSource, setFltSource] = React.useState("");
  const [fltFrom, setFltFrom] = React.useState("");
  const [fltTo, setFltTo] = React.useState("");
  const [fltSearch, setFltSearch] = React.useState("");

  const hasFilters = !!(fltStage || fltSource || fltFrom || fltTo || fltSearch);
  const clearFilters = () => {
    setFltStage("");
    setFltSource("");
    setFltFrom("");
    setFltTo("");
    setFltSearch("");
  };

  const salesJobs = React.useMemo<Job[]>(
    () =>
      (jobs || []).filter(job =>
        (SALES_STAGES as readonly string[]).includes(job.stage)
      ),
    [jobs]
  );

  // Distinct sources present on the pipeline, for the Source dropdown.
  const sourceOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const j of salesJobs) if (j.source?.trim()) set.add(j.source.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [salesJobs]);

  const filteredJobs = React.useMemo<Job[]>(() => {
    const term = fltSearch.trim().toLowerCase();
    const termDigits = term.replace(/\D/g, "");
    return salesJobs.filter(job => {
      if (fltStage && job.stage !== fltStage) return false;
      if (fltSource && (job.source?.trim() ?? "") !== fltSource) return false;
      if (fltFrom || fltTo) {
        // leadDate is the real came-in date (sheet date for imported leads).
        const day = (job.leadDate ?? job.createdAt).slice(0, 10);
        if (fltFrom && day < fltFrom) return false;
        if (fltTo && day > fltTo) return false;
      }
      if (term) {
        const nameHit = job.customerName.toLowerCase().includes(term);
        const phoneHit =
          termDigits.length > 0 &&
          (job.phone ?? "").replace(/\D/g, "").includes(termDigits);
        if (!nameHit && !phoneHit) return false;
      }
      return true;
    });
  }, [salesJobs, fltStage, fltSource, fltFrom, fltTo, fltSearch]);

  // Header counts active leads only — Sold jobs are converted, not leads.
  const activeLeadCount = React.useMemo(
    () =>
      salesJobs.filter(job =>
        (PIPELINE_STAGES as readonly string[]).includes(job.stage)
      ).length,
    [salesJobs]
  );
  const shownLeadCount = React.useMemo(
    () =>
      filteredJobs.filter(job =>
        (PIPELINE_STAGES as readonly string[]).includes(job.stage)
      ).length,
    [filteredJobs]
  );

  if (error && !jobs) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
        <p className="text-sm font-medium text-destructive">Couldn't load leads.</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Something went wrong while fetching the pipeline. Your data is safe — try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-none px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasFilters
              ? `${shownLeadCount} of ${activeLeadCount} active ${activeLeadCount === 1 ? "lead" : "leads"} shown`
              : `${activeLeadCount} active ${activeLeadCount === 1 ? "lead" : "leads"}`}
          </p>
        </div>

        {isAdmin && selectMode && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              className="h-8"
              onClick={archiveSelected}
              disabled={selectedIds.size === 0 || bulkArchive.isPending}
            >
              {bulkArchive.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Archive className="w-3.5 h-3.5 mr-1.5" />
              )}
              Archive selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
          </div>
        )}

        {isAdmin && !selectMode && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {syncStatus?.lastError ? (
                <span
                  className="inline-flex items-center gap-1 text-destructive"
                  title={syncStatus.lastError}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Sheet sync failed
                  {syncStatus.lastSyncedAt &&
                    ` — last synced ${formatSyncedAt(syncStatus.lastSyncedAt)}`}
                </span>
              ) : syncStatus?.lastSyncedAt ? (
                <span>Sheet synced {formatSyncedAt(syncStatus.lastSyncedAt)}</span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => runSync.mutate()}
                disabled={runSync.isPending || syncStatus?.running}
              >
                {runSync.isPending || syncStatus?.running ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Sync now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsCleanupOpen(true)}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                Clean up
              </Button>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-8">
              <Plus className="w-4 h-4 mr-1.5" />
              New Lead
            </Button>
          </div>
        )}
      </div>

      <div className="flex-none px-6 pb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Name or phone…"
            className="pl-8 h-8 text-sm"
            value={fltSearch}
            onChange={e => setFltSearch(e.target.value)}
          />
        </div>
        <select
          className="flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={fltStage}
          onChange={e => setFltStage(e.target.value)}
        >
          <option value="">All stages</option>
          {SALES_STAGES.map(s => (
            <option key={s} value={s}>
              {STAGE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
        <select
          className="flex h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={fltSource}
          onChange={e => setFltSource(e.target.value)}
        >
          <option value="">All sources</option>
          {sourceOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Came in</span>
          <Input
            type="date"
            className="h-8 w-[8.5rem] text-sm"
            value={fltFrom}
            onChange={e => setFltFrom(e.target.value)}
            title="Leads that came in on or after this date"
          />
          <span>–</span>
          <Input
            type="date"
            className="h-8 w-[8.5rem] text-sm"
            value={fltTo}
            onChange={e => setFltTo(e.target.value)}
            title="Leads that came in on or before this date"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {error && jobs && (
        <div className="flex-none mx-6 mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Couldn't refresh leads — the pipeline may be out of date.</span>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
          >
            {isRefetching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Retry
          </button>
        </div>
      )}

      <KanbanBoard
        jobs={filteredJobs}
        groups={SALES_GROUPS}
        isLoading={isLoading}
        cardVariant="lead"
        selectedIds={selectMode ? selectedIds : undefined}
        onToggleSelect={selectMode ? toggleSelect : undefined}
      />

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <Dialog open={isCleanupOpen} onOpenChange={setIsCleanupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clean up old leads</DialogTitle>
            <DialogDescription>
              Archives New Lead cards older than the cutoff. Nothing is deleted —
              archived leads stay in the Archived view and can be restored anytime.
              Scheduled, Bid Given, and Sold are not touched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {[30, 60, 90].map(days => (
                <Button
                  key={days}
                  variant={olderThanDays === days ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => setOlderThanDays(days)}
                >
                  Older than {days} days
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {previewFailed ? (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Couldn't count matching leads.
                  <button
                    className="font-semibold hover:underline"
                    onClick={() => setPreviewAttempt(a => a + 1)}
                  >
                    Retry
                  </button>
                </span>
              ) : preview.isPending || previewCount === null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Counting…
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{previewCount}</span>{" "}
                  {previewCount === 1 ? "lead" : "leads"} will be archived.
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Prefer to hand-pick?{" "}
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setIsCleanupOpen(false);
                  setSelectMode(true);
                }}
              >
                Select leads on the board instead
              </button>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCleanupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={archiveByAge}
              disabled={bulkArchive.isPending || !previewCount}
            >
              {bulkArchive.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Archive {previewCount ?? ""} {previewCount === 1 ? "lead" : "leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
