import * as React from "react";
import {
  useListJobs,
  useExportJobsCsv,
  getExportJobsCsvQueryKey,
  useGetCurrentUser,
  useUpdateJob,
  useArchiveJob,
  useUnarchiveJob,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  Job,
  JobStage,
} from "@workspace/api-client-react";
import { STAGE_LABELS, OPERATIONAL_STAGES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Download,
  Search,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  PenSquare,
  Eye,
  AlertTriangle,
  RefreshCw,
  X,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatCurrency } from "@/lib/utils";
import { queryClient } from "@/lib/query-client";
import { JobDialog } from "@/components/job-dialog";
import { MoveStageDialog } from "@/components/move-stage-dialog";

type SortKey =
  | "customerName"
  | "city"
  | "coverType"
  | "contractAmount"
  | "estimatedInstallDate"
  | "stage";

const STAGE_ORDER = Object.keys(STAGE_LABELS);

type Filters = {
  search: string;
  stage: string;
  city: string;
  coverType: string;
  dateFrom: string;
  dateTo: string;
};

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_FILTERS: Filters = {
  search: "",
  stage: "",
  city: "",
  coverType: "",
  dateFrom: "",
  dateTo: "",
};

const DEFAULT_SORT: Sort = { key: "estimatedInstallDate", dir: "asc" };

const SORT_KEYS: SortKey[] = [
  "customerName",
  "city",
  "coverType",
  "contractAmount",
  "estimatedInstallDate",
  "stage",
];

function prefsStorageKey(userId: string) {
  return `spc-list-prefs:${userId}`;
}

function loadPrefs(userId: string): { filters: Filters; sort: Sort } | null {
  try {
    const raw = localStorage.getItem(prefsStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const filters: Filters = { ...DEFAULT_FILTERS };
    if (parsed?.filters && typeof parsed.filters === "object") {
      (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).forEach((k) => {
        if (typeof parsed.filters[k] === "string") filters[k] = parsed.filters[k];
      });
    }
    let sort: Sort = { ...DEFAULT_SORT };
    if (
      parsed?.sort &&
      SORT_KEYS.includes(parsed.sort.key) &&
      (parsed.sort.dir === "asc" || parsed.sort.dir === "desc")
    ) {
      sort = { key: parsed.sort.key, dir: parsed.sort.dir };
    }
    return { filters, sort };
  } catch {
    return null;
  }
}

export default function ListPage() {
  const { data: user } = useGetCurrentUser();
  const userId = user?.id ? String(user.id) : null;
  const [filters, setFilters] = React.useState<Filters>({ ...DEFAULT_FILTERS });
  const [sort, setSort] = React.useState<Sort>({ ...DEFAULT_SORT });
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  // Which user's preferences the current state was initialized for. Held in
  // state (not a ref) so the persist effect below never runs against a userId
  // whose prefs haven't been loaded into state yet.
  const [initializedUserId, setInitializedUserId] = React.useState<string | null>(null);

  // Load saved preferences whenever the signed-in user changes.
  React.useEffect(() => {
    if (!userId || initializedUserId === userId) return;
    const saved = loadPrefs(userId);
    // Always initialize for this user: saved prefs if present, defaults otherwise —
    // never carry another user's in-memory filters over.
    setFilters(saved ? saved.filters : { ...DEFAULT_FILTERS });
    setSort(saved ? saved.sort : { ...DEFAULT_SORT });
    setInitializedUserId(userId);
  }, [userId, initializedUserId]);

  // Persist preferences whenever they change (after initialization for this user).
  React.useEffect(() => {
    if (!userId || initializedUserId !== userId) return;
    try {
      localStorage.setItem(prefsStorageKey(userId), JSON.stringify({ filters, sort }));
    } catch {
      // Storage unavailable (private mode/quota) — persistence is best-effort.
    }
  }, [userId, filters, sort]);

  const hasActiveFilters =
    Object.values(filters).some((v) => v !== "") ||
    sort.key !== DEFAULT_SORT.key ||
    sort.dir !== DEFAULT_SORT.dir;

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSort({ ...DEFAULT_SORT });
    if (userId) {
      try {
        localStorage.removeItem(prefsStorageKey(userId));
      } catch {
        // ignore
      }
    }
  };

  const [debouncedFilters, setDebouncedFilters] = React.useState(filters);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs({
    search: debouncedFilters.search || undefined,
    // Ignore a stale saved pre-sold stage filter — those stages no longer
    // exist on the Job List (leads live on the Sales Pipeline).
    stage:
      debouncedFilters.stage &&
      (showArchived ||
        (OPERATIONAL_STAGES as readonly string[]).includes(debouncedFilters.stage))
        ? (debouncedFilters.stage as any)
        : undefined,
    city: debouncedFilters.city || undefined,
    coverType: debouncedFilters.coverType || undefined,
    dateFrom: debouncedFilters.dateFrom || undefined,
    dateTo: debouncedFilters.dateTo || undefined,
    archived: showArchived ? true : undefined,
  });

  const sortedJobs = React.useMemo(() => {
    if (!jobs) return jobs;
    // The Job List is real jobs only (Sold and later) — leads live on the
    // Sales Pipeline. The Archived view still shows every archived record so
    // archived leads stay reachable and restorable.
    const visible = showArchived
      ? jobs
      : jobs.filter((j) =>
          (OPERATIONAL_STAGES as readonly string[]).includes(j.stage),
        );
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: Job, b: Job): number => {
      switch (sort.key) {
        case "contractAmount": {
          const av = a.contractAmount;
          const bv = b.contractAmount;
          if (av == null && bv == null) return 0;
          if (av == null) return 1; // nulls last regardless of direction
          if (bv == null) return -1;
          return (av - bv) * dir;
        }
        case "estimatedInstallDate": {
          const av = a.estimatedInstallDate;
          const bv = b.estimatedInstallDate;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return av.localeCompare(bv) * dir;
        }
        case "stage":
          return (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)) * dir;
        default: {
          const av = (a[sort.key] || "") as string;
          const bv = (b[sort.key] || "") as string;
          return av.localeCompare(bv, undefined, { sensitivity: "base" }) * dir;
        }
      }
    };
    return [...visible].sort(cmp);
  }, [jobs, sort, showArchived]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const exportCsv = useExportJobsCsv({
    query: { enabled: false, queryKey: getExportJobsCsvQueryKey() },
  });

  const handleExport = async () => {
    const result = await exportCsv.refetch();
    if (result.error || !result.data) {
      toast.error("Couldn't export the CSV — try again.");
      return;
    }
    if (result.data) {
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `superior-patio-jobs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-none px-4 pt-4 pb-3 md:px-6 border-b border-border bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {showArchived ? "Archived Jobs" : "Job List"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showArchived
                ? `${sortedJobs?.length ?? 0} archived jobs. They stay out of the board and main list until restored.`
                : `${sortedJobs?.length ?? 0} jobs shown. Click a column to sort; edit toggles and stage inline.`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`text-xs px-3 h-8 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
                showArchived
                  ? "border-foreground/20 text-foreground bg-accent/50"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archived
            </button>
            <Button
              onClick={handleExport}
              variant="outline"
              size="sm"
              disabled={exportCsv.isFetching}
            >
              {exportCsv.isFetching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export CSV
            </Button>
            {user?.role === "admin" && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Job
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search names, addresses..."
              className="pl-9 h-8 text-sm"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.stage}
            onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}
          >
            <option value="">All Stages</option>
            {(showArchived
              ? Object.keys(STAGE_LABELS)
              : (OPERATIONAL_STAGES as readonly string[])
            ).map((val) => (
              <option key={val} value={val}>
                {STAGE_LABELS[val] ?? val}
              </option>
            ))}
          </select>

          <Input
            placeholder="City"
            className="h-8 text-sm"
            value={filters.city}
            onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
          />

          <Input
            placeholder="Type of Cover"
            className="h-8 text-sm"
            value={filters.coverType}
            onChange={(e) => setFilters((f) => ({ ...f, coverType: e.target.value }))}
          />

          <Input
            placeholder="From Date"
            type="date"
            className="h-8 text-sm"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          />

          <Input
            placeholder="To Date"
            type="date"
            className="h-8 text-sm"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            title="Clear all filters and restore default sort"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Reset filters
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-accent/10">
        <table className="w-full table-fixed text-sm text-left">
          <thead className="bg-card text-muted-foreground text-[11px] uppercase font-semibold sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr>
              <SortableHeader label="Customer" sortKey="customerName" sort={sort} onSort={toggleSort} className="w-[14%] pl-4" />
              <SortableHeader label="City" sortKey="city" sort={sort} onSort={toggleSort} className="w-[8%]" />
              <SortableHeader label="Cover Type" sortKey="coverType" sort={sort} onSort={toggleSort} className="w-[11%]" />
              <SortableHeader label="Amount" sortKey="contractAmount" sort={sort} onSort={toggleSort} className="w-[7%] text-right" />
              <SortableHeader label="Est. Install" sortKey="estimatedInstallDate" sort={sort} onSort={toggleSort} className="w-[8%]" />
              <SortableHeader label="Stage" sortKey="stage" sort={sort} onSort={toggleSort} className="w-[15%]" />
              <th className="px-1 py-2 text-center w-[4%]" title="Invoiced with QuickBooks">QB</th>
              <th className="px-1 py-2 text-center w-[4%]" title="Deposit Paid">Dep</th>
              <th className="px-1 py-2 text-center w-[4%]" title="Material Ordered">Ord</th>
              <th className="px-1 py-2 text-center w-[4%]" title="Material Received">Rec</th>
              <th className="px-2 py-2 w-[18%]">Last Note</th>
              <th className="px-2 py-2 w-[3%]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {isLoading ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading jobs...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                    <p className="text-sm font-medium text-destructive">
                      Couldn't load jobs.
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Something went wrong while fetching the job list. Your data is safe — try again.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      onClick={() => refetch()}
                      disabled={isRefetching}
                    >
                      {isRefetching ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Retry
                    </Button>
                  </div>
                </td>
              </tr>
            ) : sortedJobs?.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  {showArchived ? (
                    "No archived jobs. Archive a finished job from its edit dialog or the list row."
                  ) : hasActiveFilters ? (
                    <span>
                      No jobs match these filters.{" "}
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-primary hover:underline font-medium"
                      >
                        Reset filters
                      </button>
                    </span>
                  ) : (
                    "No jobs yet — a lead becomes a job here once it's marked Sold."
                  )}
                </td>
              </tr>
            ) : (
              sortedJobs?.map((job) => (
                <ListRow key={job.id} job={job} role={user?.role} archivedView={showArchived} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <JobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-2 py-2 ${className || ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors ${active ? "text-primary" : ""}`}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          ))}
      </button>
    </th>
  );
}

function ListRow({ job, role, archivedView }: { job: Job; role?: string; archivedView?: boolean }) {
  const updateJob = useUpdateJob();
  const archiveJob = useArchiveJob();
  const unarchiveJob = useUnarchiveJob();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [moveStageIntent, setMoveStageIntent] = React.useState<JobStage | null>(null);

  const isAdmin = role === "admin";
  // Archived rows are read-only until restored.
  const canEdit = isAdmin && !archivedView;
  const canTechEdit = (role === "tech" || isAdmin) && !archivedView;
  const canMoveStage = canEdit || (role === "tech" && !archivedView);

  const invalidateJobs = () => {
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
  };

  const handleArchive = () => {
    if (
      !window.confirm(
        `Archive "${job.customerName}"? The job leaves the board and job list but is kept safe — you can restore it any time from the Archived view.`,
      )
    )
      return;
    archiveJob.mutate(
      { id: job.id },
      {
        onSuccess: () => {
          invalidateJobs();
          toast.success("Job archived — find it under Archived");
        },
        onError: (err: any) => toast.error(err?.data?.error || "Failed to archive job"),
      },
    );
  };

  const handleUnarchive = () => {
    unarchiveJob.mutate(
      { id: job.id },
      {
        onSuccess: () => {
          invalidateJobs();
          toast.success(`"${job.customerName}" restored to ${STAGE_LABELS[job.stage] || job.stage}`);
        },
        onError: (err: any) => toast.error(err?.data?.error || "Failed to restore job"),
      },
    );
  };

  const handleToggle = (
    field: keyof Pick<Job, "invoicedWithQb" | "depositPaid" | "materialOrdered" | "materialReceived">,
  ) => {
    if (!canEdit) return;
    const listKey = getListJobsQueryKey();
    const newValue = !job[field];
    // Optimistic update: flip the toggle in all cached job lists immediately.
    const previous = queryClient.getQueriesData<Job[]>({ queryKey: listKey.slice(0, 1) });
    queryClient.setQueriesData<Job[]>({ queryKey: listKey.slice(0, 1) }, (old) =>
      old?.map((j) => (j.id === job.id ? { ...j, [field]: newValue } : j)),
    );
    updateJob.mutate(
      { id: job.id, data: { [field]: newValue } },
      {
        onError: () => {
          previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
        },
      },
    );
  };

  const isLate =
    job.estimatedInstallDate &&
    new Date(job.estimatedInstallDate) < new Date() &&
    job.stage !== "installed" &&
    job.stage !== "post_install_follow_up" &&
    job.stage !== "review_asked";

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-2 pl-4 py-1.5 font-medium text-foreground truncate" title={job.customerName}>
          <span
            className={canTechEdit ? "cursor-pointer hover:text-primary" : undefined}
            onClick={() => canTechEdit && setIsEditOpen(true)}
          >
            {job.customerName}
          </span>
        </td>
        <td className="px-2 py-1.5 truncate" title={job.city || undefined}>{job.city || "-"}</td>
        <td className="px-2 py-1.5 truncate" title={job.coverType || undefined}>{job.coverType || "-"}</td>
        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
          {job.contractAmount != null ? formatCurrency(job.contractAmount) : "-"}
        </td>
        <td className={`px-2 py-1.5 font-mono tabular-nums ${isLate ? "text-destructive font-semibold" : ""}`}>
          {job.estimatedInstallDate ? formatDate(job.estimatedInstallDate) : "-"}
        </td>
        <td className="px-2 py-1.5">
          {canMoveStage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="max-w-full inline-flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-2 py-0.5 rounded text-xs font-semibold"
                  title={STAGE_LABELS[job.stage] || job.stage}
                >
                  <span className="truncate">{STAGE_LABELS[job.stage] || job.stage}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
                {Object.entries(STAGE_LABELS).map(([stageValue, label]) => {
                  if (stageValue === job.stage) return null;
                  if (role === "tech" && stageValue !== "installed") return null;
                  return (
                    <DropdownMenuItem
                      key={stageValue}
                      onClick={() => setMoveStageIntent(stageValue as JobStage)}
                    >
                      {label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span
              className="inline-block max-w-full truncate bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-semibold"
              title={STAGE_LABELS[job.stage] || job.stage}
            >
              {STAGE_LABELS[job.stage] || job.stage}
            </span>
          )}
        </td>
        <ToggleCell checked={job.invoicedWithQb} disabled={!canEdit} onToggle={() => handleToggle("invoicedWithQb")} />
        <ToggleCell checked={job.depositPaid} disabled={!canEdit} onToggle={() => handleToggle("depositPaid")} />
        <ToggleCell checked={job.materialOrdered} disabled={!canEdit} onToggle={() => handleToggle("materialOrdered")} />
        <ToggleCell checked={job.materialReceived} disabled={!canEdit} onToggle={() => handleToggle("materialReceived")} />
        <td className="px-2 py-1.5 text-xs text-muted-foreground truncate" title={job.lastNote || undefined}>
          {job.lastNote || "-"}
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          {archivedView && isAdmin ? (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={unarchiveJob.isPending}
              className="text-muted-foreground hover:text-primary transition-colors p-1 disabled:opacity-50"
              title="Restore job to the board"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditOpen(true)}
                className="text-muted-foreground hover:text-primary transition-colors p-1"
                title={canTechEdit ? "Edit job" : "View job & notes"}
              >
                {canTechEdit ? (
                  <PenSquare className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={archiveJob.isPending}
                  className="text-muted-foreground hover:text-primary transition-colors p-1 disabled:opacity-50"
                  title="Archive job"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </td>
      </tr>

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

function ToggleCell({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <td className="px-1 py-1.5 text-center">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="w-3.5 h-3.5 align-middle"
      />
    </td>
  );
}
