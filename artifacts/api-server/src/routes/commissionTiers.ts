import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, commissionTiersTable, type CommissionTier } from "@workspace/db";
import {
  ListCommissionTiersResponse,
  CreateCommissionTierBody,
  CreateCommissionTierResponse,
  UpdateCommissionTierParams,
  UpdateCommissionTierBody,
  UpdateCommissionTierResponse,
  DeleteCommissionTierParams,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function toApi(t: CommissionTier) {
  return {
    id: t.id,
    upToAmount: t.upToAmount == null ? null : Number(t.upToAmount),
    ratePercent: Number(t.ratePercent),
    position: t.position,
  };
}

/** Smallest band first, open-ended band last. */
async function allTiers(): Promise<CommissionTier[]> {
  const rows = await db
    .select()
    .from(commissionTiersTable)
    .orderBy(asc(commissionTiersTable.position), asc(commissionTiersTable.id));
  return rows.sort((a, b) => {
    if (a.upToAmount == null) return 1;
    if (b.upToAmount == null) return -1;
    return Number(a.upToAmount) - Number(b.upToAmount);
  });
}

router.get(
  "/commission-tiers",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    res.json(ListCommissionTiersResponse.parse((await allTiers()).map(toApi)));
  },
);

router.post(
  "/commission-tiers",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const body = CreateCommissionTierBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Enter a rate between 0 and 100" });
      return;
    }
    const { upToAmount, ratePercent } = body.data;
    if (upToAmount != null && upToAmount <= 0) {
      res.status(400).json({ error: "The cap has to be more than $0" });
      return;
    }

    const existing = await allTiers();
    if (upToAmount == null && existing.some((t) => t.upToAmount == null)) {
      res.status(400).json({
        error: "There is already a band for everything above the last cap",
      });
      return;
    }
    if (
      upToAmount != null &&
      existing.some((t) => t.upToAmount != null && Number(t.upToAmount) === upToAmount)
    ) {
      res.status(400).json({ error: "A band already ends at that amount" });
      return;
    }

    const [tier] = await db
      .insert(commissionTiersTable)
      .values({
        upToAmount: upToAmount == null ? null : String(upToAmount),
        ratePercent: String(ratePercent),
        position: existing.length + 1,
      })
      .returning();
    res.status(201).json(CreateCommissionTierResponse.parse(toApi(tier)));
  },
);

router.patch(
  "/commission-tiers/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateCommissionTierParams.safeParse(req.params);
    const body = UpdateCommissionTierBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const updates: Partial<CommissionTier> = {};
    if (body.data.ratePercent !== undefined) {
      updates.ratePercent = String(body.data.ratePercent);
    }
    if (body.data.upToAmount !== undefined) {
      if (body.data.upToAmount != null && body.data.upToAmount <= 0) {
        res.status(400).json({ error: "The cap has to be more than $0" });
        return;
      }
      updates.upToAmount =
        body.data.upToAmount == null ? null : String(body.data.upToAmount);
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [tier] = await db
      .update(commissionTiersTable)
      .set(updates)
      .where(eq(commissionTiersTable.id, params.data.id))
      .returning();
    if (!tier) {
      res.status(404).json({ error: "Commission band not found" });
      return;
    }
    res.json(UpdateCommissionTierResponse.parse(toApi(tier)));
  },
);

router.delete(
  "/commission-tiers/:id",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteCommissionTierParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [tier] = await db
      .delete(commissionTiersTable)
      .where(eq(commissionTiersTable.id, params.data.id))
      .returning();
    if (!tier) {
      res.status(404).json({ error: "Commission band not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
