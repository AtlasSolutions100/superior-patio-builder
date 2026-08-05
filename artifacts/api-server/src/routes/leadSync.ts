import { Router, type IRouter } from "express";
import { GetLeadSyncStatusResponse } from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { getLeadSyncState, syncLeadsFromSheet } from "../lib/leadSync";

const router: IRouter = Router();

router.get(
  "/lead-sync/status",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    res.json(GetLeadSyncStatusResponse.parse(getLeadSyncState()));
  },
);

router.post(
  "/lead-sync/run",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    await syncLeadsFromSheet();
    res.json(GetLeadSyncStatusResponse.parse(getLeadSyncState()));
  },
);

export default router;
