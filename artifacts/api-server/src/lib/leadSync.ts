import { eq } from "drizzle-orm";
import {
  db,
  jobsTable,
  jobNotesTable,
  leadImportsTable,
  leadSourcesTable,
  type LeadSource,
} from "@workspace/db";
import { logger } from "./logger";
import { entryStage } from "./stages";

/**
 * One-way lead import from admin-managed Google Sheets (lead_sources table,
 * edited on the Settings page). New rows become leads in the sales
 * pipeline's entry stage; a global ledger of dedupe keys guarantees a row is
 * only ever imported once — even if the same lead appears in two sheets.
 * Never writes back to any sheet.
 */

/** The developer-copy sheet the app synced from before sources were data. */
export const LEGACY_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KFjd_Yh91mLFH-PtlXq5yD_qVRTxYdrAOJU_AJpkp64/export?format=csv&gid=1886246861";

export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** Sheet columns the importer cannot work without. */
export const REQUIRED_COLUMNS = ["Date", "First Name", "Last Name", "Phone"];

export interface LeadSyncState {
  lastSyncedAt: string | null;
  lastError: string | null;
  lastImportedCount: number;
  running: boolean;
}

const state: LeadSyncState = {
  lastSyncedAt: null,
  lastError: null,
  lastImportedCount: 0,
  running: false,
};

export function getLeadSyncState(): LeadSyncState {
  return { ...state };
}

/**
 * Turn whatever the admin pastes into a CSV export URL.
 * - A normal share/edit link (docs.google.com/spreadsheets/d/<id>/edit#gid=N)
 *   becomes .../export?format=csv&gid=N (gid defaults to 0).
 * - An export or non-Google http(s) URL passes through unchanged.
 * Returns null when the input is not a usable http(s) URL.
 */
export function normalizeSheetUrl(input: string): string | null {
  const raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return raw;
  const m = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!m) return raw;
  if (url.pathname.includes("/export")) return raw;
  // gid may live in the query or the #gid= fragment.
  const gid =
    url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, newlines in cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      // Skip fully empty trailing rows.
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

/** Format a cleaned US number like the app does: (208) 555-0142. */
function formatPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return raw.trim() || null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Pull "Twin Falls" out of "663 Sarah Ave, Twin Falls, ID" when possible. */
function cityFromAddress(address: string): string | null {
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Last part is usually the state (possibly with a zip); city is before it.
    const last = parts[parts.length - 1];
    if (/^[A-Za-z]{2}\.?(\s+\d{5})?$/.test(last) && parts.length >= 3) {
      return parts[parts.length - 2] || null;
    }
    // "…, Jerome, ID 83338" handled above; "…, Twin Falls" fallback:
    if (!/\d/.test(last)) return last;
  }
  return null;
}

function friendlySource(utmSource: string): string {
  const s = utmSource.trim().toLowerCase();
  if (!s) return "Spreadsheet";
  if (s === "google") return "Google Ads";
  if (s.includes("website") || s.includes("web")) return "Website";
  if (s.includes("facebook") || s === "fb" || s.includes("meta")) return "Facebook";
  return utmSource.trim();
}

interface SheetLead {
  dedupeKey: string;
  customerName: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  source: string;
  note: string | null;
}

export function mapRows(rows: string[][]): SheetLead[] {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex(h => h === name.toLowerCase());

  // Hard-fail on incompatible sheets instead of silently importing junk:
  // these columns are required for identity and naming.
  const missing = REQUIRED_COLUMNS.filter(name => col(name) === -1);
  if (missing.length > 0) {
    throw new Error(
      `Sheet columns changed — missing: ${missing.join(", ")}. No rows imported.`,
    );
  }

  const iDate = col("Date");
  const iFirst = col("First Name");
  const iLast = col("Last Name");
  const iPhone = col("Phone");
  const iCleaned = col("Phone Number Cleaned");
  const iEmail = col("Email");
  const iAddress = col("Address");
  const iNotes = col("Notes");
  const iProduct = col("Product");
  const iUtm = col("UTM Source");

  const leads: SheetLead[] = [];
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
    const first = get(iFirst);
    const last = get(iLast);
    const customerName = [first, last].filter(Boolean).join(" ").trim();
    if (!customerName) continue; // unusable row

    const rawPhone = get(iCleaned) || get(iPhone);
    const phoneDigits = rawPhone.replace(/[^\d]/g, "");
    const date = get(iDate);
    // Stable identity for a sheet row: submission date + phone digits,
    // falling back to name when the row has no phone.
    // WARNING: this format is frozen — the ledger already holds keys in it.
    // Changing the derivation would re-import every existing row.
    const dedupeKey = `${date}|${phoneDigits || customerName.toLowerCase()}`;
    // A row with neither a date nor a phone has no stable identity; skip it
    // rather than risk duplicate imports on every sync.
    if (!date && !phoneDigits) continue;

    const address = get(iAddress) || null;
    const noteParts = [
      get(iNotes),
      get(iProduct) && `Product: ${get(iProduct)}`,
      get(iEmail) && `Email: ${get(iEmail)}`,
    ].filter(Boolean);

    leads.push({
      dedupeKey,
      customerName,
      phone: rawPhone ? formatPhone(rawPhone) : null,
      address,
      city: address ? cityFromAddress(address) : null,
      source: friendlySource(get(iUtm)),
      note: noteParts.length ? noteParts.join(" · ") : null,
    });
  }
  return leads;
}

/**
 * Fetch a sheet URL and import its new rows. Returns the number imported.
 * Throws with a readable message on fetch/format failures.
 */
async function importFromUrl(csvUrl: string): Promise<number> {
  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed with HTTP ${res.status}`);
  const csv = await res.text();
  const leads = mapRows(parseCsv(csv));

  const entry = await entryStage("sales");
  if (!entry) throw new Error("The sales pipeline has no stages — add one in Settings");

  const existing = await db
    .select({ dedupeKey: leadImportsTable.dedupeKey })
    .from(leadImportsTable);
  const seen = new Set(existing.map(e => e.dedupeKey));

  let imported = 0;
  for (const lead of leads) {
    if (seen.has(lead.dedupeKey)) continue;
    seen.add(lead.dedupeKey); // duplicate rows within the same CSV
    const didImport = await db.transaction(async tx => {
      const inserted = await tx
        .insert(leadImportsTable)
        .values({ dedupeKey: lead.dedupeKey })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) return false; // raced with another sync
      const [job] = await tx
        .insert(jobsTable)
        .values({
          customerName: lead.customerName,
          phone: lead.phone,
          address: lead.address,
          city: lead.city,
          source: lead.source,
          stage: entry.key,
          lastNote: lead.note,
        })
        .returning();
      await tx
        .update(leadImportsTable)
        .set({ jobId: job.id })
        .where(eq(leadImportsTable.id, inserted[0].id));
      if (lead.note) {
        await tx.insert(jobNotesTable).values({
          jobId: job.id,
          authorName: "Imported from spreadsheet",
          text: lead.note,
        });
      }
      return true;
    });
    if (didImport) imported++;
  }
  return imported;
}

/**
 * Sync one source and record the outcome on its row.
 * Returns the number of newly imported leads; throws on failure (after
 * recording the error on the source row).
 */
export async function syncSource(source: LeadSource): Promise<number> {
  try {
    const imported = await importFromUrl(source.csvUrl);
    await db
      .update(leadSourcesTable)
      .set({
        lastSyncedAt: new Date(),
        lastError: null,
        lastImportedCount: imported,
      })
      .where(eq(leadSourcesTable.id, source.id));
    if (imported > 0) {
      logger.info({ source: source.name, imported }, "Lead sync imported new leads");
    }
    return imported;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(leadSourcesTable)
      .set({ lastError: message })
      .where(eq(leadSourcesTable.id, source.id));
    logger.error({ err, source: source.name }, "Lead sync failed for source");
    throw err;
  }
}

/**
 * Run one sync pass over every enabled source. Aggregates per-source results
 * into the module state that backs /lead-sync/status (and the admin banner).
 * Returns the total number of newly imported leads.
 */
export async function syncAllSources(): Promise<number> {
  if (state.running) return 0;
  state.running = true;
  try {
    const sources = await db
      .select()
      .from(leadSourcesTable)
      .where(eq(leadSourcesTable.enabled, true))
      .orderBy(leadSourcesTable.id);

    let imported = 0;
    let firstError: string | null = null;
    for (const source of sources) {
      try {
        imported += await syncSource(source);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!firstError) firstError = `${source.name}: ${message}`;
      }
    }

    if (!firstError) state.lastSyncedAt = new Date().toISOString();
    state.lastError = firstError;
    state.lastImportedCount = imported;
    return imported;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Lead sync failed");
    return 0;
  } finally {
    state.running = false;
  }
}

/** Back-compat alias used by routes and tests. */
export const syncLeadsFromSheet = syncAllSources;

/** Start the recurring sync (called once at server startup). */
export function startLeadSync(): void {
  void syncAllSources();
  const timer = setInterval(() => void syncAllSources(), SYNC_INTERVAL_MS);
  timer.unref?.();
}
