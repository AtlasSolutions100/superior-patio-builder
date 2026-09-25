import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, integrationsTable, type Integration, type Job } from "@workspace/db";
import { logger } from "./logger";

/**
 * QuickBooks Online — OAuth2 + the two API calls this app makes
 * (look up a Customer by name, create one).
 *
 * Intuit specifics that shape this file:
 *  - Access tokens live one hour. Refresh tokens live ~100 days but are
 *    ROTATED on every refresh: the response carries a new refresh token and
 *    the old one dies. Every refresh therefore rewrites the integrations row
 *    before anything else happens.
 *  - The company id ("realmId") arrives on the OAuth callback, not in the
 *    token response, and must be stored alongside the tokens.
 *  - Sandbox and production are different hosts, chosen by QBO_ENVIRONMENT.
 */

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const MINOR_VERSION = "73";

export interface QboEnv {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "production";
  redirectUri: string;
}

/** Null when the app has not been given Intuit credentials. */
export function qboEnv(env: NodeJS.ProcessEnv = process.env): QboEnv | null {
  const clientId = env.QBO_CLIENT_ID?.trim();
  const clientSecret = env.QBO_CLIENT_SECRET?.trim();
  const redirectUri = env.QBO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: env.QBO_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox",
  };
}

export function apiBase(environment: QboEnv["environment"]): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ---------------------------------------------------------------------------
// OAuth state. Single-process in-memory map with a short TTL: enough to bind
// a callback to the admin who started it and to reject replays. If the app
// ever runs more than one instance, move this to the database.
// ---------------------------------------------------------------------------
const pendingStates = new Map<string, { userId: number; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function newState(userId: number): string {
  for (const [k, v] of pendingStates) {
    if (Date.now() - v.createdAt > STATE_TTL_MS) pendingStates.delete(k);
  }
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, { userId, createdAt: Date.now() });
  return state;
}

export function consumeState(state: string): number | null {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry.userId;
}

export function authorizeUrl(env: QboEnv, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", QBO_SCOPE);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(env: QboEnv, body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(env: QboEnv, code: string): Promise<TokenResponse> {
  return tokenRequest(
    env,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.redirectUri,
    }),
  );
}

export async function refreshTokens(env: QboEnv, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(
    env,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

export async function revokeToken(env: QboEnv, token: string): Promise<void> {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  // Best effort: a failed revoke shouldn't stop the local disconnect.
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Connection row
// ---------------------------------------------------------------------------
export async function getConnection(): Promise<Integration | null> {
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.provider, "quickbooks"));
  return row ?? null;
}

export async function saveTokens(
  tokens: TokenResponse,
  extra: Partial<Pick<Integration, "realmId" | "externalName" | "connectedByUserId" | "connectedAt">> = {},
): Promise<Integration> {
  const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in - 60) * 1000);
  const values = {
    provider: "quickbooks" as const,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    lastError: null,
    ...extra,
  };
  const [row] = await db
    .insert(integrationsTable)
    .values(values)
    .onConflictDoUpdate({ target: integrationsTable.provider, set: values })
    .returning();
  return row;
}

/**
 * A usable access token, refreshing (and persisting the rotated refresh
 * token) when the current one is within a minute of expiring.
 */
export async function accessToken(env: QboEnv): Promise<{ token: string; realmId: string }> {
  const conn = await getConnection();
  if (!conn?.refreshToken || !conn.realmId) {
    throw new Error("QuickBooks is not connected");
  }
  const fresh = conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() > Date.now();
  if (fresh) return { token: conn.accessToken!, realmId: conn.realmId };

  const tokens = await refreshTokens(env, conn.refreshToken);
  await saveTokens(tokens); // rotated refresh token lands here, before any API call
  return { token: tokens.access_token, realmId: conn.realmId };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
async function qboFetch<T>(
  env: QboEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { token, realmId } = await accessToken(env);
  const url = `${apiBase(env.environment)}/v3/company/${realmId}${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks API ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function companyName(env: QboEnv, realmId: string): Promise<string | null> {
  try {
    const data = await qboFetch<{ CompanyInfo?: { CompanyName?: string } }>(
      env,
      `/companyinfo/${realmId}`,
    );
    return data.CompanyInfo?.CompanyName ?? null;
  } catch (err) {
    logger.warn({ err }, "Could not read QuickBooks company name");
    return null;
  }
}

/** QBO's query language wants single quotes doubled inside string literals. */
function q(value: string): string {
  return value.replace(/'/g, "''");
}

export async function findCustomerByName(env: QboEnv, displayName: string): Promise<string | null> {
  const query = `select Id from Customer where DisplayName = '${q(displayName)}'`;
  const data = await qboFetch<{ QueryResponse?: { Customer?: { Id: string }[] } }>(
    env,
    `/query?query=${encodeURIComponent(query)}`,
  );
  return data.QueryResponse?.Customer?.[0]?.Id ?? null;
}

/** The subset of a job that becomes a QuickBooks Customer. */
export function customerPayload(job: Pick<Job, "customerName" | "phone" | "address" | "city" | "coverType">) {
  const payload: Record<string, unknown> = { DisplayName: job.customerName.trim() };
  if (job.phone) payload.PrimaryPhone = { FreeFormNumber: job.phone };
  if (job.address || job.city) {
    payload.BillAddr = {
      ...(job.address ? { Line1: job.address } : {}),
      ...(job.city ? { City: job.city } : {}),
    };
  }
  if (job.coverType) payload.Notes = `Job: ${job.coverType}`;
  return payload;
}

export async function createCustomer(env: QboEnv, job: Job): Promise<string> {
  const data = await qboFetch<{ Customer?: { Id: string } }>(env, `/customer`, {
    method: "POST",
    body: JSON.stringify(customerPayload(job)),
  });
  const id = data.Customer?.Id;
  if (!id) throw new Error("QuickBooks did not return a Customer id");
  return id;
}

/**
 * Idempotent: a customer with the same display name is reused, so re-running
 * a sync never fills QuickBooks with duplicates.
 */
export async function findOrCreateCustomer(env: QboEnv, job: Job): Promise<string> {
  const existing = await findCustomerByName(env, job.customerName.trim());
  return existing ?? createCustomer(env, job);
}
