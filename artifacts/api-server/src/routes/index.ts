import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import projectsRouter from "./projects";
import requirementsRouter from "./requirements";
import testCasesRouter from "./test-cases";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import calendarRouter from "./calendar";
import notificationsRouter from "./notifications";
import socialEventsRouter from "./social-events";
import aiRouter from "./ai";
import pmoReportRouter from "./pmo-report";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(projectsRouter);
router.use(requirementsRouter);
router.use(testCasesRouter);
router.use(tasksRouter);
router.use(dashboardRouter);
router.use(calendarRouter);
router.use(notificationsRouter);
router.use(socialEventsRouter);
router.use(aiRouter);
router.use(pmoReportRouter);

export default router;
