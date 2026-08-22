import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, leadSourcesTable, type LeadSource } from "@workspace/db";
import {
  ListLeadSourcesResponse,
  CreateLeadSourceBody,
  CreateLeadSourceResponse,
  TestLeadSourceBody,
  TestLeadSourceResponse,
  UpdateLeadSourceParams,
  UpdateLeadSourceBody,
  UpdateLeadSourceResponse,
  DeleteLeadSourceParams,
  SyncLeadSourceParams,
  SyncLeadSourceResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";
import {
  normalizeSheetUrl,
  parseCsv,
  syncSource,
  REQUIRED_COLUMNS,
} from "../lib/leadSync";

const router: IRouter = Router();

function toApi(s: LeadSource) {
  return {
    id: s.id,
    name: s.name,
    csvUrl: s.csvUrl,
    enabled: s.enabled,
    lastSyncedAt: s.lastSyncedAt == null ? null : s.lastSyncedAt.toISOString(),
    lastError: s.lastError,
    lastImportedCount: s.lastImportedCount,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get(
  "/lead-sources",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const sources = await db
      .select()
      .from(leadSourcesTable)
      .orderBy(leadSourcesTable.id);
    res.json(ListLeadSourcesResponse.parse(sources.map(toApi)));
  },
);

router.post(
  "/lead-sources",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const body = CreateLeadSourceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Enter a name and the sheet's link" });
      return;
    }
    const name = body.data.name.trim();
    const csvUrl = normalizeSheetUrl(body.data.csvUrl);
    if (!name) {
      res.status(400).json({ error: "Give the sheet a name" });
      return;
    }
    if (!csvUrl) {
      res.status(400).json({
        error: "That doesn't look like a link — paste the sheet's URL from your browser",
      });
      return;
    }

    const [source] = await db
      .insert(leadSourcesTable)
      .values({ name, csvUrl })
      .returning();
    res.status(201).json(CreateLeadSourceResponse.parse(toApi(source)));
  },
);

/**
 * Dry-run: fetch the URL and report what the importer sees — found columns,
 * missing required columns, and the row count. Never imports anything.
 */
router.post(
  "/lead-sources/test",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const body = TestLeadSourceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Paste the sheet's link first" });
      return;
    }
    const normalizedUrl = normalizeSheetUrl(body.data.csvUrl);
    const fail = (error: string) =>
      res.json(
        TestLeadSourceResponse.parse({
          ok: false,
          normalizedUrl,
          columns: [],
          missingColumns: [],
          rowCount: 0,
          error,
        }),
      );

    if (!normalizedUrl) {
      fail("That doesn't look like a link — paste the sheet's URL from your browser");
      return;
    }

    try {
      const resp = await fetch(normalizedUrl, { redirect: "follow" });
      if (!resp.ok) {
        fail(
          resp.status === 401 || resp.status === 403 || resp.status === 404
            ? "The sheet isn't shared publicly — in Google Sheets use Share → Anyone with the link → Viewer"
            : `The sheet responded with HTTP ${resp.status}`,
        );
        return;
      }
      const text = await resp.text();
      if (text.trimStart().startsWith("<")) {
        fail(
          "Got a web page instead of data — the sheet probably isn't shared. Use Share → Anyone with the link → Viewer",
        );
        return;
      }
      const rows = parseCsv(text);
      if (rows.length === 0) {
        fail("The sheet is empty");
        return;
      }
      const columns = rows[0].map((c) => c.trim()).filter(Boolean);
      const lower = columns.map((c) => c.toLowerCase());
      const missingColumns = REQUIRED_COLUMNS.filter(
        (c) => !lower.includes(c.toLowerCase()),
      );
      res.json(
        TestLeadSourceResponse.parse({
          ok: missingColumns.length === 0,
          normalizedUrl,
          columns,
          missingColumns,
          rowCount: Math.max(0, rows.length - 1),
          error:
            missingColumns.length === 0
              ? null
              : `Missing required column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}`,
        }),
      );
    } catch {
      fail("Couldn't reach that URL — check the link and try again");
    }
  },
);

router.patch(
  "/lead-sources/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateLeadSourceParams.safeParse(req.params);
    const body = UpdateLeadSourceBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const updates: Partial<LeadSource> = {};
    if (body.data.name !== undefined) {
      const name = body.data.name.trim();
      if (!name) {
        res.status(400).json({ error: "Give the sheet a name" });
        return;
      }
      updates.name = name;
    }
    if (body.data.csvUrl !== undefined) {
      const csvUrl = normalizeSheetUrl(body.data.csvUrl);
      if (!csvUrl) {
        res.status(400).json({
          error: "That doesn't look like a link — paste the sheet's URL from your browser",
        });
        return;
      }
      updates.csvUrl = csvUrl;
      // The URL changed — old status no longer describes this source.
      updates.lastError = null;
      updates.lastSyncedAt = null;
      updates.lastImportedCount = 0;
    }
    if (body.data.enabled !== undefined) updates.enabled = body.data.enabled;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [source] = await db
      .update(leadSourcesTable)
      .set(updates)
      .where(eq(leadSourcesTable.id, params.data.id))
      .returning();
    if (!source) {
      res.status(404).json({ error: "Sheet not found" });
      return;
    }
    res.json(UpdateLeadSourceResponse.parse(toApi(source)));
  },
);

router.delete(
  "/lead-sources/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteLeadSourceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [source] = await db
      .delete(leadSourcesTable)
      .where(eq(leadSourcesTable.id, params.data.id))
      .returning();
    if (!source) {
      res.status(404).json({ error: "Sheet not found" });
      return;
    }
    res.status(204).end();
  },
);

router.post(
  "/lead-sources/:id/sync",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SyncLeadSourceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [source] = await db
      .select()
      .from(leadSourcesTable)
      .where(eq(leadSourcesTable.id, params.data.id));
    if (!source) {
      res.status(404).json({ error: "Sheet not found" });
      return;
    }

    // syncSource records success/failure on the row either way.
    await syncSource(source).catch(() => 0);

    const [fresh] = await db
      .select()
      .from(leadSourcesTable)
      .where(eq(leadSourcesTable.id, source.id));
    res.json(SyncLeadSourceResponse.parse(toApi(fresh)));
  },
);

export default router;
