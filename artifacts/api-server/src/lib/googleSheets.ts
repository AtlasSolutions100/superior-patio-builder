import { createSign } from "node:crypto";
import type { Job } from "@workspace/db";

/**
 * Google Sheets write-back, signed in as a service account.
 *
 * Why a service account and not OAuth: the spreadsheets scope is
 * "restricted", so an OAuth app needs Google's verification review before
 * outside users can grant it, and an unverified app in Testing mode expires
 * its refresh tokens every seven days. A service account has none of that —
 * the admin simply shares the sheet with the account's email, like a person.
 *
 * The app writes to its OWN tab in the workbook (default "Job Board") and
 * never touches other tabs, so Justin's existing columns and formulas are
 * safe; he can reference the tab from his own sheets with formulas.
 */

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const DEFAULT_SHEET_NAME = "Job Board";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/** Null when no service account key is configured. */
export function serviceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  let raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const b64 = env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!raw && b64) raw = Buffer.from(b64, "base64").toString("utf8");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) return null;
    return {
      client_email: j.client_email,
      private_key: j.private_key,
      token_uri: j.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

/** Accepts a full sheet URL or a bare id and returns the id. */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// JWT bearer grant
// ---------------------------------------------------------------------------
const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Exported for tests: a signed RS256 assertion for the token endpoint. */
export function signedAssertion(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SHEETS_SCOPE,
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));
  return `${header}.${claims}.${signature}`;
}

let cached: { token: string; expiresAt: number; email: string } | null = null;

export async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedAssertion(sa),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    email: sa.client_email,
    expiresAt: Date.now() + Math.max(60, data.expires_in - 60) * 1000,
  };
  return cached.token;
}

// ---------------------------------------------------------------------------
// Sheets API
// ---------------------------------------------------------------------------
const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch<T>(sa: ServiceAccount, path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(sa);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `Google Sheets said ${res.status}. Usually the sheet is not shared with ${sa.client_email} (share it as Editor), or the Sheets API is not enabled for the project.`,
      );
    }
    throw new Error(`Google Sheets API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface SheetMeta {
  title: string;
  tabs: string[];
}

export async function spreadsheetMeta(sa: ServiceAccount, spreadsheetId: string): Promise<SheetMeta> {
  const data = await sheetsFetch<{
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  }>(sa, `/${spreadsheetId}?fields=properties.title,sheets.properties.title`);
  return {
    title: data.properties?.title ?? spreadsheetId,
    tabs: (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean),
  };
}

/** A1 notation needs the tab name quoted when it has spaces or punctuation. */
export function a1Tab(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

async function ensureTab(sa: ServiceAccount, spreadsheetId: string, sheetName: string): Promise<void> {
  const meta = await spreadsheetMeta(sa, spreadsheetId);
  if (meta.tabs.includes(sheetName)) return;
  await sheetsFetch(sa, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    }),
  });
}

async function tabIsEmpty(sa: ServiceAccount, spreadsheetId: string, sheetName: string): Promise<boolean> {
  const data = await sheetsFetch<{ values?: string[][] }>(
    sa,
    `/${spreadsheetId}/values/${encodeURIComponent(`${a1Tab(sheetName)}!A1:A1`)}`,
  );
  return !data.values || data.values.length === 0;
}

export const ROW_HEADER = [
  "Date Sold",
  "Customer",
  "Phone",
  "Address",
  "City",
  "Cover Type",
  "Contract Amount",
  "Sold By",
  "Commission",
  "Est. Install Date",
  "Stage",
  "Job ID",
] as const;

export interface RowExtras {
  soldByName: string | null;
  commissionAmount: number | null;
  stageLabel: string;
  dateSold: Date;
}

/** Exported for tests: the exact row a job becomes. */
export function jobToRow(job: Job, extras: RowExtras): (string | number)[] {
  return [
    extras.dateSold.toISOString().slice(0, 10),
    job.customerName,
    job.phone ?? "",
    job.address ?? "",
    job.city ?? "",
    job.coverType ?? "",
    job.contractAmount == null ? "" : Number(job.contractAmount),
    extras.soldByName ?? "",
    extras.commissionAmount == null ? "" : extras.commissionAmount,
    job.estimatedInstallDate ?? "",
    extras.stageLabel,
    job.id,
  ];
}

/**
 * Appends one job. Creates the tab and writes the header row the first time,
 * so the admin only has to share the workbook — nothing else to set up.
 */
export async function appendJobRow(
  sa: ServiceAccount,
  spreadsheetId: string,
  sheetName: string,
  row: (string | number)[],
): Promise<void> {
  await ensureTab(sa, spreadsheetId, sheetName);
  const values: (string | number)[][] = [];
  if (await tabIsEmpty(sa, spreadsheetId, sheetName)) values.push([...ROW_HEADER]);
  values.push(row);
  await sheetsFetch(
    sa,
    `/${spreadsheetId}/values/${encodeURIComponent(`${a1Tab(sheetName)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}
