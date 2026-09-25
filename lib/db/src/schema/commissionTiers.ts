import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Sales commission rates, banded by contract amount. Justin's rates step up
 * with job size ("up to 20,000 gets 3%..."), so a tier is "contracts up to
 * `upToAmount` earn `ratePercent`", and the last tier may leave `upToAmount`
 * null to mean "and everything above".
 *
 * Rates are edited in Settings rather than hardcoded — they vary by job and
 * Justin is the only one who knows the full table.
 */
export const commissionTiersTable = pgTable("commission_tiers", {
  id: serial("id").primaryKey(),
  /** Inclusive upper bound of this band; null = no upper bound. */
  upToAmount: numeric("up_to_amount", { precision: 12, scale: 2 }),
  /** Percent of the contract amount, e.g. 3 = 3%. */
  ratePercent: numeric("rate_percent", { precision: 6, scale: 3 }).notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CommissionTier = typeof commissionTiersTable.$inferSelect;

/**
 * Commission on a contract, or null when no tier covers it (which is how the
 * UI knows to say "add a tier" rather than showing a confident $0).
 */
export function commissionFor(
  contractAmount: number | null | undefined,
  tiers: Pick<CommissionTier, "upToAmount" | "ratePercent">[],
): number | null {
  if (contractAmount == null || !Number.isFinite(contractAmount)) return null;
  // Smallest band first; the first band the amount fits in wins.
  const ordered = [...tiers].sort((a, b) => {
    if (a.upToAmount == null) return 1;
    if (b.upToAmount == null) return -1;
    return Number(a.upToAmount) - Number(b.upToAmount);
  });
  for (const tier of ordered) {
    const cap = tier.upToAmount == null ? Infinity : Number(tier.upToAmount);
    if (contractAmount <= cap) {
      return Math.round(contractAmount * (Number(tier.ratePercent) / 100) * 100) / 100;
    }
  }
  return null;
}
