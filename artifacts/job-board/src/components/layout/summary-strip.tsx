import * as React from "react";
import { useGetBoardSummary } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function SummaryStrip() {
  const { data: summary, isLoading, error } = useGetBoardSummary();

  if (error) {
    return (
      <div className="h-14 border-b bg-card flex items-center px-6 text-sm text-destructive shrink-0">
        Failed to load summary.
      </div>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className="h-14 border-b bg-card flex items-center px-6 shrink-0">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading summary...</span>
      </div>
    );
  }

  return (
    <div className="h-14 border-b bg-card flex items-center px-6 gap-8 shrink-0 overflow-x-auto custom-scrollbar">
      <div className="flex flex-col shrink-0">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Active Jobs</span>
        <span className="text-sm font-semibold">{summary.totalJobs}</span>
      </div>
      <div className="flex flex-col shrink-0">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Pipeline</span>
        <span className="text-sm font-semibold font-mono text-primary">
          {formatCurrency(summary.totalContractValue)}
        </span>
      </div>
      <div className="flex flex-col shrink-0">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Installs Next 14D</span>
        <span className="text-sm font-semibold text-foreground">
          {summary.installsNext14Days}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-6">
        {summary.upcomingInstalls.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Next Up:</span>
            <div className="flex gap-2">
              {summary.upcomingInstalls.slice(0, 2).map((job) => (
                <div key={job.id} className="text-xs bg-muted px-2 py-1 rounded font-medium truncate max-w-[150px]">
                  {job.customerName}
                </div>
              ))}
              {summary.upcomingInstalls.length > 2 && (
                <div className="text-xs text-muted-foreground py-1">
                  +{summary.upcomingInstalls.length - 2}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
