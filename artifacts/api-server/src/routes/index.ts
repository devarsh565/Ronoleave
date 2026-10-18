import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hrRouter from "./hr";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hrRouter);

export default router;
