import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { currentUser, login, register } from "../modules/auth/auth.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(register));
authRouter.post("/login", asyncHandler(login));
authRouter.get("/me", authenticate, asyncHandler(currentUser));

