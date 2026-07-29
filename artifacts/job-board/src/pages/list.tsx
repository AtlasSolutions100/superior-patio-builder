import * as React from "react";
import { useListJobs, useExportJobsCsv, getExportJobsCsvQueryKey } from "@workspace/api-client-react";
import { STAGE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Search, SlidersHorizontal } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function ListPage() {
  const [filters, setFilters] = React.useState({
    search: "",
    stage: "",
    city: "",
    coverType: "",
    dateFrom: "",
    dateTo: "",
  });

  const [debouncedFilters, setDebouncedFilters] = React.useState(filters);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data: jobs, isLoading } = useListJobs({
    search: debouncedFilters.search || undefined,
    stage: debouncedFilters.stage ? (debouncedFilters.stage as any) : undefined,
    city: debouncedFilters.city || undefined,
    coverType: debouncedFilters.coverType || undefined,
    dateFrom: debouncedFilters.dateFrom || undefined,
    dateTo: debouncedFilters.dateTo || undefined,
  });

  const exportCsv = useExportJobsCsv({ query: { enabled: false, queryKey: getExportJobsCsvQueryKey() } });

  const handleExport = async () => {
    try {
      const result = await exportCsv.refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `superior-patio-jobs-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (e) {
      console.error("Export failed", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-none p-4 md:p-6 border-b border-border bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">List View</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Search and filter across all jobs.
            </p>
          </div>
          
          <Button onClick={handleExport} variant="outline" className="shrink-0" disabled={exportCsv.isFetching}>
            {exportCsv.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export CSV
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="relative col-span-1 sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search names, addresses..." 
              className="pl-9"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          
          <select 
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.stage}
            onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}
          >
            <option value="">All Stages</option>
            {Object.entries(STAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <Input 
            placeholder="City" 
            value={filters.city}
            onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}
          />

          <Input 
            placeholder="Type of Cover" 
            value={filters.coverType}
            onChange={e => setFilters(f => ({ ...f, coverType: e.target.value }))}
          />
          
          <Input 
            placeholder="From Date" 
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
          />

          <Input 
            placeholder="To Date" 
            type="date"
            value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 bg-accent/10">
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Est. Install</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Cover Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">QB</th>
                <th className="px-4 py-3 text-center">Dep</th>
                <th className="px-4 py-3 text-center">Mat.O</th>
                <th className="px-4 py-3 text-center">Mat.R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading jobs...
                  </td>
                </tr>
              ) : jobs?.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No jobs found matching these filters.
                  </td>
                </tr>
              ) : (
                jobs?.map(job => (
                  <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{job.customerName}</td>
                    <td className="px-4 py-3">
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-semibold">
                        {STAGE_LABELS[job.stage] || job.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{job.estimatedInstallDate ? formatDate(job.estimatedInstallDate) : '-'}</td>
                    <td className="px-4 py-3">{job.city || '-'}</td>
                    <td className="px-4 py-3">{job.coverType || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{job.contractAmount ? formatCurrency(job.contractAmount) : '-'}</td>
                    <td className="px-4 py-3 text-center text-lg">{job.invoicedWithQb ? '✓' : '-'}</td>
                    <td className="px-4 py-3 text-center text-lg">{job.depositPaid ? '✓' : '-'}</td>
                    <td className="px-4 py-3 text-center text-lg">{job.materialOrdered ? '✓' : '-'}</td>
                    <td className="px-4 py-3 text-center text-lg">{job.materialReceived ? '✓' : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
