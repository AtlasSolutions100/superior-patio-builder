import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import {
  GetIntegrationsResponse,
  UpdateGoogleSheetsBody,
  UpdateGoogleSheetsResponse,
  TestGoogleSheetsBody,
  TestGoogleSheetsResponse,
  SyncIntegrationParams,
  SyncIntegrationResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";
import * as qbo from "../lib/quickbooks";
import * as sheets from "../lib/googleSheets";
import { backfill, sheetsConnection } from "../lib/integrationSync";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Where the browser lands after the Intuit round trip. */
function settingsUrl(req: { headers: Record<string, unknown> }, query: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
  return `${proto}://${host}/settings?${query}`;
}

async function status() {
  const env = qbo.qboEnv();
  const conn = await qbo.getConnection();
  const sa = sheets.serviceAccount();
  const { row: sheetRow, config } = await sheetsConnection();

  return {
    quickbooks: {
      configured: !!env,
      connected: !!(conn?.refreshToken && conn.realmId),
      environment: env?.environment ?? "sandbox",
      companyName: conn?.externalName ?? null,
      connectedAt: conn?.connectedAt?.toISOString() ?? null,
      lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
      lastError: conn?.lastError ?? null,
    },
    googleSheets: {
      configured: !!sa,
      serviceAccountEmail: sa?.client_email ?? null,
      spreadsheetId: config.spreadsheetId,
      spreadsheetTitle: sheetRow?.externalName ?? null,
      sheetName: config.sheetName,
      enabled: config.enabled,
      lastSyncAt: sheetRow?.lastSyncAt?.toISOString() ?? null,
      lastError: sheetRow?.lastError ?? null,
    },
  };
}

router.get("/integrations", requireUser, requireAdmin, async (_req, res): Promise<void> => {
  res.json(GetIntegrationsResponse.parse(await status()));
});

// ---------------------------------------------------------------------------
// QuickBooks OAuth. These two are browser navigations, not JSON endpoints,
// so they live outside the generated client.
// ---------------------------------------------------------------------------
router.get(
  "/integrations/quickbooks/connect",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const env = qbo.qboEnv();
    if (!env) {
      res.redirect(settingsUrl(req, "quickbooks=not-configured"));
      return;
    }
    res.redirect(qbo.authorizeUrl(env, qbo.newState(req.appUser!.id)));
  },
);

router.get("/integrations/quickbooks/callback", async (req, res): Promise<void> => {
  const env = qbo.qboEnv();
  const { code, state, realmId, error } = req.query as Record<string, string | undefined>;
  if (!env || error || !code || !state || !realmId) {
    logger.warn({ error }, "QuickBooks callback rejected");
    res.redirect(settingsUrl(req, `quickbooks=error&reason=${encodeURIComponent(error ?? "missing-params")}`));
    return;
  }
  const userId = qbo.consumeState(state);
  if (userId == null) {
    res.redirect(settingsUrl(req, "quickbooks=error&reason=stale-state"));
    return;
  }
  try {
    const tokens = await qbo.exchangeCode(env, code);
    await qbo.saveTokens(tokens, {
      realmId,
      connectedByUserId: userId,
      connectedAt: new Date(),
    });
    const name = await qbo.companyName(env, realmId);
    if (name) {
      await db
        .update(integrationsTable)
        .set({ externalName: name })
        .where(eq(integrationsTable.provider, "quickbooks"));
    }
    res.redirect(settingsUrl(req, "quickbooks=connected"));
  } catch (err) {
    logger.error({ err }, "QuickBooks token exchange failed");
    res.redirect(settingsUrl(req, "quickbooks=error&reason=token-exchange"));
  }
});

router.post(
  "/integrations/quickbooks/disconnect",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const env = qbo.qboEnv();
    const conn = await qbo.getConnection();
    if (env && conn?.refreshToken) await qbo.revokeToken(env, conn.refreshToken);
    await db.delete(integrationsTable).where(eq(integrationsTable.provider, "quickbooks"));
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
router.put(
  "/integrations/google-sheets",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const body = UpdateGoogleSheetsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { config: current } = await sheetsConnection();
    const next = { ...current };

    if (body.data.spreadsheet !== undefined) {
      if (body.data.spreadsheet === null || body.data.spreadsheet.trim() === "") {
        next.spreadsheetId = null;
      } else {
        const id = sheets.spreadsheetIdFrom(body.data.spreadsheet);
        if (!id) {
          res.status(400).json({ error: "Paste the spreadsheet's link from your browser" });
          return;
        }
        next.spreadsheetId = id;
      }
    }
    if (body.data.sheetName !== undefined) next.sheetName = body.data.sheetName.trim() || sheets.DEFAULT_SHEET_NAME;
    if (body.data.enabled !== undefined) next.enabled = body.data.enabled;
    if (next.enabled && !next.spreadsheetId) {
      res.status(400).json({ error: "Add the spreadsheet before turning the sync on" });
      return;
    }

    // Refresh the title when the target changes so Settings shows the real name.
    let externalName: string | null = null;
    const sa = sheets.serviceAccount();
    if (sa && next.spreadsheetId && next.spreadsheetId !== current.spreadsheetId) {
      externalName = await sheets
        .spreadsheetMeta(sa, next.spreadsheetId)
        .then((m) => m.title)
        .catch(() => null);
    }

    const values = {
      provider: "google_sheets" as const,
      config: next,
      ...(next.spreadsheetId !== current.spreadsheetId ? { externalName, lastError: null } : {}),
      connectedByUserId: req.appUser!.id,
      connectedAt: new Date(),
    };
    await db
      .insert(integrationsTable)
      .values(values)
      .onConflictDoUpdate({ target: integrationsTable.provider, set: values });

    res.json(UpdateGoogleSheetsResponse.parse(await status()));
  },
);

router.post(
  "/integrations/google-sheets/test",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const body = TestGoogleSheetsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Paste the spreadsheet's link first" });
      return;
    }
    const spreadsheetId = sheets.spreadsheetIdFrom(body.data.spreadsheet);
    const fail = (error: string) =>
      res.json(TestGoogleSheetsResponse.parse({ ok: false, spreadsheetId, title: null, tabs: [], error }));

    const sa = sheets.serviceAccount();
    if (!sa) {
      fail("The server has no Google service-account key yet (GOOGLE_SERVICE_ACCOUNT_JSON_B64)");
      return;
    }
    if (!spreadsheetId) {
      fail("That doesn't look like a spreadsheet link");
      return;
    }
    try {
      const meta = await sheets.spreadsheetMeta(sa, spreadsheetId);
      res.json(
        TestGoogleSheetsResponse.parse({ ok: true, spreadsheetId, title: meta.title, tabs: meta.tabs, error: null }),
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  },
);

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------
router.post(
  "/integrations/:provider/sync",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SyncIntegrationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Unknown connection" });
      return;
    }
    const provider = params.data.provider === "quickbooks" ? "quickbooks" : "google_sheets";
    res.json(SyncIntegrationResponse.parse(await backfill(provider)));
  },
);

export default router;
