import { AlertTriangle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  useGetLeadSyncStatus,
  getGetLeadSyncStatusQueryKey,
  useRunLeadSync,
} from "@workspace/api-client-react";

/**
 * Admin-only warning banner shown when the last spreadsheet lead sync
 * failed (e.g. the sheet's columns were renamed/removed). Polls the
 * lead-sync status endpoint and clears itself once a sync succeeds.
 */
export function LeadSyncBanner() {
  const { data: user } = useGetCurrentUser();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const { data: status } = useGetLeadSyncStatus({
    query: {
      queryKey: getGetLeadSyncStatusQueryKey(),
      enabled: isAdmin,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });

  const runSync = useRunLeadSync({
    mutation: {
      onSuccess: (result) => {
        // The run endpoint returns the fresh status; update the cache
        // immediately so the banner clears (or updates its error) at once.
        queryClient.setQueryData(getGetLeadSyncStatusQueryKey(), result);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetLeadSyncStatusQueryKey(),
        });
      },
    },
  });

  if (!isAdmin || !status?.lastError) return null;

  const lastOk = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      role="alert"
      data-testid="lead-sync-banner"
      className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <span className="font-semibold text-destructive">
          Lead import from the spreadsheet is failing:
        </span>{" "}
        <span className="text-foreground/90 break-words">{status.lastError}</span>{" "}
        <span className="text-muted-foreground">
          {lastOk
            ? `Last successful sync: ${lastOk}.`
            : "No sync has succeeded yet."}{" "}
          New leads will not appear until this is fixed.
        </span>
        {runSync.isError && (
          <span className="text-destructive">
            {" "}
            Retry failed — check the sheet and try again.
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid="lead-sync-retry-button"
        onClick={() => runSync.mutate()}
        disabled={runSync.isPending}
        className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${runSync.isPending ? "animate-spin" : ""}`}
        />
        {runSync.isPending ? "Importing…" : "Retry import now"}
      </button>
    </div>
  );
}
