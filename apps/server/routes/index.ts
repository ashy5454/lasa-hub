import { Router, type IRouter } from "express";
import healthRouter from "./health";
import otpRouter from "./otp";
import aiRouter from "./ai";
import wholesalersRouter from "./wholesalers";
import ordersRouter from "./orders";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(otpRouter);
router.use(aiRouter);
router.use(wholesalersRouter);
router.use(ordersRouter);
router.use(adminRouter);

export default router;
