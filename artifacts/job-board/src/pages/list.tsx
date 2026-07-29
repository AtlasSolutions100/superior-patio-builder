import * as React from "react";
import {
  useListJobs,
  useExportJobsCsv,
  getExportJobsCsvQueryKey,
  useGetCurrentUser,
  useUpdateJob,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  Job,
  JobStage,
} from "@workspace/api-client-react";
import { STAGE_LABELS } from "@/lib/utils";
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
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
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

export default function ListPage() {
  const { data: user } = useGetCurrentUser();
  const [filters, setFilters] = React.useState({
    search: "",
    stage: "",
    city: "",
    coverType: "",
    dateFrom: "",
    dateTo: "",
  });
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "estimatedInstallDate",
    dir: "asc",
  });
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const [debouncedFilters, setDebouncedFilters] = React.useState(filters);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data: jobs, isLoading, error, refetch, isRefetching } = useListJobs({
    search: debouncedFilters.search || undefined,
    stage: debouncedFilters.stage ? (debouncedFilters.stage as any) : undefined,
    city: debouncedFilters.city || undefined,
    coverType: debouncedFilters.coverType || undefined,
    dateFrom: debouncedFilters.dateFrom || undefined,
    dateTo: debouncedFilters.dateTo || undefined,
  });

  const sortedJobs = React.useMemo(() => {
    if (!jobs) return jobs;
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
    return [...jobs].sort(cmp);
  }, [jobs, sort]);

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
            <h1 className="text-xl font-bold tracking-tight">Job List</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sortedJobs?.length ?? 0} jobs shown. Click a column to sort; edit toggles and stage inline.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
            {Object.entries(STAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
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
                  No jobs found matching these filters.
                </td>
              </tr>
            ) : (
              sortedJobs?.map((job) => (
                <ListRow key={job.id} job={job} role={user?.role} />
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

function ListRow({ job, role }: { job: Job; role?: string }) {
  const updateJob = useUpdateJob();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [moveStageIntent, setMoveStageIntent] = React.useState<JobStage | null>(null);

  const canEdit = role === "admin";
  const canTechEdit = role === "tech" || canEdit;
  const canMoveStage = canEdit || role === "tech";

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
        <td className="px-2 py-1.5 text-right">
          {canTechEdit && (
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="text-muted-foreground hover:text-primary transition-colors p-1"
              title="Edit job"
            >
              <PenSquare className="w-3.5 h-3.5" />
            </button>
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
