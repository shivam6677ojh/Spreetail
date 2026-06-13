import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { groupRouter } from "./group.routes.js";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/groups", groupRouter);
