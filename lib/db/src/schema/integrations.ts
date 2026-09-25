import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * One row per connected outside service. Two providers today:
 *
 *   quickbooks    — OAuth2. Holds the access/refresh tokens and the realm
 *                   (company) id. Intuit ROTATES the refresh token on every
 *                   refresh, so the row is rewritten each time; losing that
 *                   write silently kills the connection within the hour.
 *   google_sheets — no tokens: the app signs in as a service account whose
 *                   key lives in the environment. The row holds which sheet
 *                   and tab to write to, plus status.
 *
 * Tokens never leave the server; the API exposes connection status only.
 */
export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(), // quickbooks | google_sheets
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  /** When the access token stops working. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** QuickBooks company id. */
  realmId: text("realm_id"),
  /** Human label for the connected thing — company name, spreadsheet title. */
  externalName: text("external_name"),
  /** Provider-specific settings, e.g. { spreadsheetId, sheetName, enabled }. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  connectedByUserId: integer("connected_by_user_id"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Integration = typeof integrationsTable.$inferSelect;
export type IntegrationProvider = "quickbooks" | "google_sheets";
