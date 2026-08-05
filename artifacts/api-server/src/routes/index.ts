import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import jobsRouter from "./jobs";
import leadSyncRouter from "./leadSync";
import feedbackRouter from "./feedback";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoRouter);
router.use(usersRouter);
router.use(jobsRouter);
router.use(leadSyncRouter);
router.use(feedbackRouter);

export default router;
