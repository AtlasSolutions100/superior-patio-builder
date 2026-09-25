import * as React from "react";
import {
  useGetIntegrations,
  useDisconnectQuickBooks,
  useUpdateGoogleSheets,
  useTestGoogleSheets,
  useSyncIntegration,
  getGetIntegrationsQueryKey,
  type IntegrationsStatus,
  type GoogleSheetsTestResult,
  type IntegrationSyncResult,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin-only: where sold jobs get pushed. Marking a job sold (moving it into
 * the Job Board) creates the customer in QuickBooks and appends a row to the
 * connected Google Sheet. Both are optional and independent.
 */

const errMsg = (err: any, fallback: string) => err?.data?.error || fallback;

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function syncSummary(r: IntegrationSyncResult): string {
  const parts = [`${r.synced} pushed`];
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  if (r.failed) parts.push(`${r.failed} failed`);
  return parts.join(", ");
}

export function ConnectionsSection() {
  const { data, isLoading } = useGetIntegrations({
    query: { queryKey: getGetIntegrationsQueryKey() },
  });

  // The Intuit round trip lands back here with ?quickbooks=connected|error.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("quickbooks");
    if (!outcome) return;
    if (outcome === "connected") toast.success("QuickBooks connected");
    else if (outcome === "not-configured") toast.error("QuickBooks keys aren't set on the server yet");
    else toast.error(`QuickBooks didn't connect (${params.get("reason") ?? "unknown"}) — try again`);
    params.delete("quickbooks");
    params.delete("reason");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    queryClient.invalidateQueries({ queryKey: getGetIntegrationsQueryKey() });
  }, []);

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Connections</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3 max-w-xl">
        When a job is marked sold, it's added to QuickBooks as a customer and
        written to your Google Sheet. Each connection is optional.
      </p>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading…
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <QuickBooksCard status={data.quickbooks} />
          <GoogleSheetsCard status={data.googleSheets} />
        </div>
      )}
    </section>
  );
}

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="text-xs inline-flex items-start gap-1.5">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-500" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
      )}
      <span className="text-muted-foreground">{children}</span>
    </p>
  );
}

function SyncButton({ provider }: { provider: "quickbooks" | "google-sheets" }) {
  const sync = useSyncIntegration();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      disabled={sync.isPending}
      onClick={() =>
        sync.mutate(
          { provider },
          {
            onSuccess: (r) => {
              queryClient.invalidateQueries({ queryKey: getGetIntegrationsQueryKey() });
              if (r.failed) toast.error(`${syncSummary(r)}. ${r.errors[0] ?? ""}`);
              else toast.success(r.synced ? syncSummary(r) : "Nothing new to push");
            },
            onError: (err: any) => toast.error(errMsg(err, "Sync failed — try again.")),
          },
        )
      }
    >
      {sync.isPending ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
      )}
      Push existing sold jobs
    </Button>
  );
}

// ---------------------------------------------------------------------------
// QuickBooks
// ---------------------------------------------------------------------------
function QuickBooksCard({ status }: { status: IntegrationsStatus["quickbooks"] }) {
  const disconnect = useDisconnectQuickBooks();

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="quickbooks-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">QuickBooks Online</h3>
          <p className="text-xs text-muted-foreground">
            Sold jobs become customers, ready to invoice.
            {status.environment === "sandbox" && status.configured ? " (sandbox)" : ""}
          </p>
        </div>
      </div>

      {!status.configured ? (
        <StatusLine ok={false}>
          Not set up on the server yet — needs QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REDIRECT_URI.
        </StatusLine>
      ) : status.connected ? (
        <>
          <StatusLine ok>
            Connected to <strong className="text-foreground">{status.companyName ?? "your company"}</strong>
            {status.connectedAt ? ` since ${when(status.connectedAt)}` : ""}. Last push: {when(status.lastSyncAt)}.
          </StatusLine>
          {status.lastError && (
            <StatusLine ok={false}>Last error: {status.lastError}</StatusLine>
          )}
        </>
      ) : (
        <StatusLine ok={false}>Not connected. Sign in with the QuickBooks account that owns your company file.</StatusLine>
      )}

      <div className="flex flex-wrap gap-2">
        {status.configured && !status.connected && (
          <Button asChild size="sm" className="h-8">
            <a href="/api/integrations/quickbooks/connect">Connect QuickBooks</a>
          </Button>
        )}
        {status.connected && (
          <>
            <SyncButton provider="quickbooks" />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getGetIntegrationsQueryKey() });
                    toast.success("QuickBooks disconnected");
                  },
                  onError: (err: any) => toast.error(errMsg(err, "Couldn't disconnect — try again.")),
                })
              }
            >
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
function GoogleSheetsCard({ status }: { status: IntegrationsStatus["googleSheets"] }) {
  const update = useUpdateGoogleSheets();
  const test = useTestGoogleSheets();
  const [sheet, setSheet] = React.useState(status.spreadsheetId ?? "");
  const [tab, setTab] = React.useState(status.sheetName);
  const [result, setResult] = React.useState<GoogleSheetsTestResult | null>(null);

  React.useEffect(() => {
    setSheet(status.spreadsheetId ?? "");
    setTab(status.sheetName);
  }, [status.spreadsheetId, status.sheetName]);

  const dirty = sheet.trim() !== (status.spreadsheetId ?? "") || tab.trim() !== status.sheetName;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetIntegrationsQueryKey() });

  const save = (enabled?: boolean) =>
    update.mutate(
      {
        data: {
          spreadsheet: sheet.trim() === "" ? null : sheet.trim(),
          sheetName: tab.trim() || "Job Board",
          ...(enabled === undefined ? {} : { enabled }),
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast.success(enabled === undefined ? "Sheet saved" : enabled ? "Sheet sync on" : "Sheet sync off");
        },
        onError: (err: any) => toast.error(errMsg(err, "Couldn't save — try again.")),
      },
    );

  const copyEmail = async () => {
    if (!status.serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(status.serviceAccountEmail);
      toast.success("Copied — share the sheet with this address as Editor");
    } catch {
      toast.error("Couldn't copy; select the address and copy it by hand");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="google-sheets-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Google Sheets</h3>
          <p className="text-xs text-muted-foreground">
            Each sold job is added as a row on its own tab in your workbook. Your other tabs are never touched.
          </p>
        </div>
        {status.configured && (
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="sheets-enabled" className="text-xs text-muted-foreground">
              {status.enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="sheets-enabled"
              checked={status.enabled}
              disabled={update.isPending || (!status.enabled && !status.spreadsheetId)}
              onCheckedChange={(v) => save(v)}
              aria-label="Google Sheets sync"
            />
          </div>
        )}
      </div>

      {!status.configured ? (
        <StatusLine ok={false}>
          Not set up on the server yet — needs GOOGLE_SERVICE_ACCOUNT_JSON_B64.
        </StatusLine>
      ) : (
        <>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            <p className="text-muted-foreground">1. Share your spreadsheet (as Editor) with:</p>
            <div className="flex items-center gap-1.5 mt-1">
              <code className="text-[11px] text-foreground break-all">{status.serviceAccountEmail}</code>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={copyEmail} aria-label="Copy address">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sheet-url" className="text-xs text-muted-foreground">
              2. Paste the spreadsheet's link
            </Label>
            <Input
              id="sheet-url"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sheet-tab" className="text-xs text-muted-foreground">
                Tab name
              </Label>
              <Input
                id="sheet-tab"
                value={tab}
                onChange={(e) => setTab(e.target.value)}
                placeholder="Job Board"
                className="h-8 text-sm w-40"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={test.isPending || !sheet.trim()}
              onClick={() =>
                test.mutate(
                  { data: { spreadsheet: sheet.trim() } },
                  {
                    onSuccess: setResult,
                    onError: (err: any) => toast.error(errMsg(err, "Test failed — try again.")),
                  },
                )
              }
            >
              {test.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Test
            </Button>
            <Button size="sm" className="h-8" disabled={update.isPending || !dirty} onClick={() => save()}>
              {update.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
          </div>

          {result && (
            <StatusLine ok={result.ok}>
              {result.ok
                ? `Opened "${result.title}"${result.tabs.length ? ` — tabs: ${result.tabs.join(", ")}` : ""}`
                : result.error}
            </StatusLine>
          )}

          {status.spreadsheetId && (
            <StatusLine ok={!status.lastError}>
              {status.lastError
                ? `Last error: ${status.lastError}`
                : `Writing to "${status.spreadsheetTitle ?? status.spreadsheetId}" › ${status.sheetName}. Last push: ${when(status.lastSyncAt)}.`}
            </StatusLine>
          )}

          {status.enabled && status.spreadsheetId && (
            <div>
              <SyncButton provider="google-sheets" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
