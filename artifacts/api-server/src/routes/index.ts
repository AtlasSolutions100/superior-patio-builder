import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import jobsRouter from "./jobs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(jobsRouter);

export default router;
