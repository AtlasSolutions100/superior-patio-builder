import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import jobsRouter from "./jobs";
import leadSyncRouter from "./leadSync";
import feedbackRouter from "./feedback";
import demoRouter from "./demo";
import stagesRouter from "./stages";
import leadSourcesRouter from "./leadSources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoRouter);
router.use(usersRouter);
router.use(stagesRouter);
router.use(jobsRouter);
router.use(leadSyncRouter);
router.use(leadSourcesRouter);
router.use(feedbackRouter);

export default router;
